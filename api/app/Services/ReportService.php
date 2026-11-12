<?php

namespace App\Services;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The owner's figures for any run of days. All money is whole pesewas.
 * Voided sales are counted separately and never add to sales or commission.
 */
final class ReportService
{
    /** Longest range one report may cover. */
    public const MAX_DAYS = 366;

    /**
     * @return array<string, mixed>
     */
    public static function summary(string $branchId, string $from, string $to): array
    {
        [$start, $end] = self::bounds($from, $to);

        $inRange = Sale::query()->where('branch_id', $branchId)->whereBetween('sold_at', [$start, $end]);

        $sales = (clone $inRange)->where('status', SaleStatus::Active)
            ->get(['id', 'amount', 'payment_method', 'category_id', 'customer_id', 'sold_at']);

        $expenses = Expense::query()
            ->where('branch_id', $branchId)
            ->whereBetween('spent_at', [$start, $end])
            ->get(['amount', 'category', 'spent_at']);

        $shares = SaleWasher::query()
            ->whereIn('sale_id', (clone $inRange)->where('status', SaleStatus::Active)->select('id'))
            ->get(['sale_id', 'washer_id', 'commission_amount']);

        $salesTotal = (int) $sales->sum('amount');
        $expensesTotal = (int) $expenses->sum('amount');
        $commissionTotal = (int) $shares->sum('commission_amount');

        return [
            'from' => $start->toDateString(),
            'to' => $end->toDateString(),
            'totals' => [
                'vehicles' => $sales->count(),
                'sales' => $salesTotal,
                'cash' => (int) $sales->where('payment_method', PaymentMethod::Cash)->sum('amount'),
                'momo' => (int) $sales->where('payment_method', PaymentMethod::Momo)->sum('amount'),
                'expenses' => $expensesTotal,
                'commission' => $commissionTotal,
                'net' => $salesTotal - $expensesTotal - $commissionTotal,
                'voided' => (clone $inRange)->where('status', SaleStatus::Voided)->count(),
            ],
            'daily' => self::daily($start, $end, $sales, $expenses),
            'by_vehicle' => self::byVehicle($sales),
            'by_crew' => self::byCrew($shares),
            'expenses_by_category' => $expenses->groupBy(fn (Expense $expense) => $expense->category->value)
                ->map(fn (Collection $rows, string $category) => ['category' => $category, 'amount' => (int) $rows->sum('amount')])
                ->sortByDesc('amount')->values()->all(),
            'top_customers' => self::topCustomers($sales),
        ];
    }

    /**
     * Every sale in the range, voided ones included, for the Excel export.
     *
     * @return list<array<string, mixed>>
     */
    public static function saleRows(string $branchId, string $from, string $to): array
    {
        [$start, $end] = self::bounds($from, $to);

        $sales = Sale::query()
            ->where('branch_id', $branchId)
            ->whereBetween('sold_at', [$start, $end])
            ->with(['saleWashers:id,sale_id,washer_id,commission_amount'])
            ->orderBy('sold_at')
            ->get();

        $vehicles = VehicleCategory::withTrashed()->where('branch_id', $branchId)->pluck('name', 'id');
        $crew = Washer::withTrashed()->where('branch_id', $branchId)->pluck('name', 'id');
        $users = User::withTrashed()->where('branch_id', $branchId)->pluck('name', 'id');

        return $sales->map(fn (Sale $sale) => [
            'sold_at' => $sale->sold_at->format('Y-m-d H:i'),
            'vehicle' => $vehicles[$sale->category_id] ?? '',
            'plate' => $sale->plate_number ?? '',
            'amount' => $sale->amount,
            'payment' => $sale->payment_method === PaymentMethod::Cash ? 'Cash' : 'MoMo',
            'crew' => $sale->saleWashers->map(fn (SaleWasher $share) => $crew[$share->washer_id] ?? '')->filter()->implode(', '),
            'commission' => (int) $sale->saleWashers->sum('commission_amount'),
            'recorded_by' => $users[$sale->recorded_by] ?? '',
            'note' => $sale->service_note ?? '',
            'status' => $sale->isVoided() ? 'Voided: '.($sale->void_reason ?? '') : 'Active',
        ])->all();
    }

    /**
     * Every expense in the range, for the Excel export.
     *
     * @return list<array<string, mixed>>
     */
    public static function expenseRows(string $branchId, string $from, string $to): array
    {
        [$start, $end] = self::bounds($from, $to);
        $users = User::withTrashed()->where('branch_id', $branchId)->pluck('name', 'id');

        return Expense::query()
            ->where('branch_id', $branchId)
            ->whereBetween('spent_at', [$start, $end])
            ->orderBy('spent_at')
            ->get()
            ->map(fn (Expense $expense) => [
                'spent_at' => $expense->spent_at->format('Y-m-d H:i'),
                'category' => ucfirst($expense->category->value),
                'amount' => $expense->amount,
                'payment' => $expense->payment_method === PaymentMethod::Cash ? 'Cash' : 'MoMo',
                'note' => $expense->note ?? '',
                'recorded_by' => $users[$expense->recorded_by] ?? '',
            ])->all();
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private static function bounds(string $from, string $to): array
    {
        $timezone = config('app.timezone');

        return [Carbon::parse($from, $timezone)->startOfDay(), Carbon::parse($to, $timezone)->endOfDay()];
    }

    /**
     * One row per day in the range, including days with nothing recorded.
     *
     * @return list<array{date: string, vehicles: int, sales: int, expenses: int}>
     */
    private static function daily(Carbon $start, Carbon $end, Collection $sales, Collection $expenses): array
    {
        $salesByDay = $sales->groupBy(fn (Sale $sale) => $sale->sold_at->toDateString());
        $expensesByDay = $expenses->groupBy(fn (Expense $expense) => $expense->spent_at->toDateString());

        $days = [];
        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            $date = $day->toDateString();
            $days[] = [
                'date' => $date,
                'vehicles' => isset($salesByDay[$date]) ? $salesByDay[$date]->count() : 0,
                'sales' => (int) ($salesByDay[$date] ?? collect())->sum('amount'),
                'expenses' => (int) ($expensesByDay[$date] ?? collect())->sum('amount'),
            ];
        }

        return $days;
    }

    /**
     * @return list<array{category_id: string, name: string, vehicles: int, amount: int}>
     */
    private static function byVehicle(Collection $sales): array
    {
        $names = VehicleCategory::withTrashed()->whereIn('id', $sales->pluck('category_id')->unique())->pluck('name', 'id');

        return $sales->groupBy('category_id')
            ->map(fn (Collection $rows, string $id) => [
                'category_id' => $id,
                'name' => $names[$id] ?? 'Removed vehicle type',
                'vehicles' => $rows->count(),
                'amount' => (int) $rows->sum('amount'),
            ])
            ->sortByDesc('amount')->values()->all();
    }

    /**
     * The pay sheet: what each crew member earned on active sales in the range.
     *
     * @return list<array{washer_id: string, name: string, vehicles: int, commission: int}>
     */
    private static function byCrew(Collection $shares): array
    {
        $names = Washer::withTrashed()->whereIn('id', $shares->pluck('washer_id')->unique())->pluck('name', 'id');

        return $shares->groupBy('washer_id')
            ->map(fn (Collection $rows, string $id) => [
                'washer_id' => $id,
                'name' => $names[$id] ?? 'Removed crew member',
                'vehicles' => $rows->count(),
                'commission' => (int) $rows->sum('commission_amount'),
            ])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }

    /**
     * The ten customers who spent most in the range.
     *
     * @return list<array{customer_id: string, plate_number: string, name: string|null, visits: int, spent: int}>
     */
    private static function topCustomers(Collection $sales): array
    {
        $ranked = $sales->whereNotNull('customer_id')->groupBy('customer_id')
            ->map(fn (Collection $rows, string $id) => ['customer_id' => $id, 'visits' => $rows->count(), 'spent' => (int) $rows->sum('amount')])
            ->sortByDesc('spent')->take(10)->values();

        $customers = Customer::withTrashed()->whereIn('id', $ranked->pluck('customer_id'))->get()->keyBy('id');

        return $ranked->map(fn (array $row) => $row + [
            'plate_number' => $customers[$row['customer_id']]->plate_number ?? '',
            'name' => $customers[$row['customer_id']]->name ?? null,
        ])->all();
    }
}
