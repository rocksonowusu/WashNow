<?php

namespace App\Services;

use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Sale;

final class CustomerStats
{
    /**
     * Visit count and total spent are always counted again from the customer's
     * active sales, so a void or a late sync can never leave them wrong.
     */
    public static function recalculate(?string $customerId): void
    {
        $customer = $customerId ? Customer::query()->find($customerId) : null;

        if (! $customer) {
            return;
        }

        $sales = Sale::query()
            ->where('customer_id', $customer->id)
            ->where('status', SaleStatus::Active);

        $customer->forceFill([
            'visit_count' => (clone $sales)->count(),
            'total_spent' => (int) (clone $sales)->sum('amount'),
        ])->save();
    }
}
