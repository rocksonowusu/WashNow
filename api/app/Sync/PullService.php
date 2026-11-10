<?php

namespace App\Sync;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DayClosing;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Support\Carbon;

/**
 * The change feed: everything in the user's branch that changed since the
 * device's cursor, including removed records (deleted_at is set on those).
 */
class PullService
{
    /**
     * The new cursor is set this far behind the clock. A write that was in
     * progress during this pull is then sent again next time instead of being
     * missed. Receiving a record twice is harmless: devices upsert by id.
     */
    private const OVERLAP_SECONDS = 5;

    /**
     * @return array{cursor: string, tables: array<string, list<array<string, mixed>>>}
     */
    public function changes(User $user, ?Carbon $since): array
    {
        // Fixed before reading, so nothing written while we read is skipped.
        $cursor = now()->subSeconds(self::OVERLAP_SECONDS)->startOfSecond();

        $branchId = $user->branch_id;
        $today = today();

        $sales = Sale::withTrashed()->where('branch_id', $branchId);
        $saleWashers = SaleWasher::withTrashed()->where('branch_id', $branchId);
        $expenses = Expense::withTrashed()->where('branch_id', $branchId);
        $dayClosings = DayClosing::withTrashed()->where('branch_id', $branchId);

        // Cashiers work on today only and never see the bay's profit, so
        // their devices are not sent earlier days or the closing totals.
        if (! $user->isOwner()) {
            $sales->where('sold_at', '>=', $today);
            $saleWashers->whereIn('sale_id', Sale::withTrashed()
                ->select('id')
                ->where('branch_id', $branchId)
                ->where('sold_at', '>=', $today));
            $expenses->where('spent_at', '>=', $today);
            $dayClosings->whereRaw('1 = 0');
        }

        $queries = [
            'branches' => Branch::withTrashed()->whereKey($branchId),
            'users' => User::withTrashed()->where('branch_id', $branchId),
            'vehicle_categories' => VehicleCategory::withTrashed()->where('branch_id', $branchId),
            'washers' => Washer::withTrashed()->where('branch_id', $branchId),
            'customers' => Customer::withTrashed()->where('branch_id', $branchId),
            'sales' => $sales,
            'sale_washers' => $saleWashers,
            'expenses' => $expenses,
            'day_closings' => $dayClosings,
        ];

        $tables = [];

        foreach ($queries as $table => $query) {
            $tables[$table] = $query
                ->when($since, fn ($query) => $query->where('updated_at', '>=', $since))
                ->orderBy('updated_at')
                ->orderBy('id')
                ->get()
                ->toArray(); // hidden fields such as the PIN hash are left out
        }

        return ['cursor' => $cursor->toIso8601String(), 'tables' => $tables];
    }
}
