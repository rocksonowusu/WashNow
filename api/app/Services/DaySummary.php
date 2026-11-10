<?php

namespace App\Services;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleWasher;
use Illuminate\Support\Carbon;

final class DaySummary
{
    /**
     * Totals for one business day. All money is in pesewas. Voided sales are
     * counted separately and never add to sales or commission.
     *
     * @return array<string, mixed>
     */
    public static function for(string $branchId, string $date): array
    {
        $start = Carbon::parse($date, config('app.timezone'))->startOfDay();
        $end = $start->copy()->endOfDay();

        $daySales = Sale::query()
            ->where('branch_id', $branchId)
            ->whereBetween('sold_at', [$start, $end]);

        $active = (clone $daySales)->where('status', SaleStatus::Active)->get(['id', 'amount', 'payment_method']);

        $expenses = Expense::query()
            ->where('branch_id', $branchId)
            ->whereBetween('spent_at', [$start, $end])
            ->get(['amount', 'payment_method']);

        $commissions = SaleWasher::query()
            ->whereIn('sale_id', $active->pluck('id'))
            ->with(['washer' => fn ($query) => $query->withTrashed()->select('id', 'name')])
            ->get()
            ->groupBy('washer_id')
            ->map(fn ($rows, $washerId) => [
                'washer_id' => $washerId,
                'washer_name' => $rows->first()->washer?->name,
                'cars' => $rows->count(),
                'amount' => (int) $rows->sum('commission_amount'),
            ])
            ->sortBy('washer_name')
            ->values();

        $salesTotal = (int) $active->sum('amount');
        $expensesTotal = (int) $expenses->sum('amount');
        $commissionTotal = (int) $commissions->sum('amount');

        return [
            'date' => $start->toDateString(),
            'cars_washed' => $active->count(),
            'sales_total' => $salesTotal,
            'cash_total' => (int) $active->where('payment_method', PaymentMethod::Cash)->sum('amount'),
            'momo_total' => (int) $active->where('payment_method', PaymentMethod::Momo)->sum('amount'),
            'voided_count' => (clone $daySales)->where('status', SaleStatus::Voided)->count(),
            'expenses_total' => $expensesTotal,
            'commission_total' => $commissionTotal,
            'commissions' => $commissions->all(),
            'net' => $salesTotal - $expensesTotal - $commissionTotal,
        ];
    }
}
