<?php

namespace App\Services;

use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use App\Support\Money;
use App\Support\PlateNumber;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SaleService
{
    /**
     * @param  array<string, mixed>  $data  Already validated for shape by the controller.
     *
     * @throws ValidationException
     */
    public function create(User $user, array $data): Sale
    {
        return DB::transaction(function () use ($user, $data): Sale {
            $branchId = $user->branch_id;

            $category = VehicleCategory::query()
                ->where('branch_id', $branchId)
                ->where('active', true)
                ->find($data['category_id']);

            if (! $category) {
                $this->fail('category_id', 'Choose a vehicle category from the list.');
            }

            $amount = (int) $data['amount'];
            $overrideReason = $this->checkPrice($user, $category, $amount, $data['override_reason'] ?? null);

            $soldAt = isset($data['sold_at'])
                ? Carbon::parse($data['sold_at'])->setTimezone(config('app.timezone'))
                : now();

            if ($soldAt->isAfter(now()->addMinutes(5))) {
                $this->fail('sold_at', 'A sale cannot be dated in the future.');
            }

            DayLock::ensureOpen($branchId, $soldAt, 'sold_at');

            $washers = $this->findWashers($branchId, $data['washer_ids']);
            [$customer, $plate] = $this->findCustomer($branchId, $data);

            $sale = new Sale([
                'branch_id' => $branchId,
                'category_id' => $category->id,
                'customer_id' => $customer?->id,
                'plate_number' => $plate,
                'service_note' => $data['service_note'] ?? null,
                'amount' => $amount,
                'payment_method' => $data['payment_method'],
                'recorded_by' => $user->id,
                'sold_at' => $soldAt,
                'status' => SaleStatus::Active,
                'override_reason' => $overrideReason,
            ]);

            if (! empty($data['id'])) {
                $sale->id = $data['id'];
            }

            $sale->save();

            foreach ($this->splitCommission($amount, $washers) as $share) {
                SaleWasher::query()->create(['branch_id' => $branchId, 'sale_id' => $sale->id] + $share);
            }

            CustomerStats::recalculate($sale->customer_id);

            return $sale->load('saleWashers');
        });
    }

    /**
     * @throws ValidationException
     */
    public function void(Sale $sale, string $reason): Sale
    {
        return DB::transaction(function () use ($sale, $reason): Sale {
            if ($sale->isVoided()) {
                $this->fail('reason', 'This sale has already been voided.');
            }

            DayLock::ensureOpen($sale->branch_id, $sale->sold_at, 'reason');

            // The commission rows stay as they were recorded. Reports only
            // count commission on active sales.
            $sale->update(['status' => SaleStatus::Voided, 'void_reason' => $reason]);

            CustomerStats::recalculate($sale->customer_id);

            return $sale->load('saleWashers');
        });
    }

    /**
     * The sale is shared equally between its washers, and each washer earns
     * their own percentage of their share. The percentage is copied onto the
     * sale so later changes to a washer's rate never alter past pay.
     *
     * @param  list<Washer>  $washers
     * @return list<array{washer_id: string, commission_percent: string, commission_amount: int}>
     */
    public function splitCommission(int $amount, array $washers): array
    {
        $count = count($washers);
        $base = intdiv($amount, $count);
        $leftover = $amount % $count;
        $rows = [];

        foreach ($washers as $index => $washer) {
            // Spare pesewas go to the first washers so the shares add up exactly.
            $share = $base + ($index < $leftover ? 1 : 0);
            $basisPoints = (int) round(((float) $washer->commission_percent) * 100);

            $rows[] = [
                'washer_id' => $washer->id,
                'commission_percent' => $washer->commission_percent,
                'commission_amount' => intdiv($share * $basisPoints + 5000, 10000),
            ];
        }

        return $rows;
    }

    /**
     * Returns the override reason to store, or null when the price is in range.
     */
    private function checkPrice(User $user, VehicleCategory $category, int $amount, ?string $overrideReason): ?string
    {
        if ($amount >= $category->min_price && $amount <= $category->max_price) {
            return null;
        }

        $range = Money::format($category->min_price).' to '.Money::format($category->max_price);
        $problem = Money::format($amount)." is outside the {$category->name} range ({$range}).";

        if (! $user->isOwner()) {
            $this->fail('amount', $problem.' Only the owner can approve this price.');
        }

        $overrideReason = trim((string) $overrideReason);

        if ($overrideReason === '') {
            $this->fail('override_reason', $problem.' Give a reason to approve it.');
        }

        return $overrideReason;
    }

    /**
     * @param  list<string>  $ids
     * @return list<Washer> In the order the cashier picked them.
     */
    private function findWashers(string $branchId, array $ids): array
    {
        $found = Washer::query()
            ->where('branch_id', $branchId)
            ->where('active', true)
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        if ($found->count() !== count($ids)) {
            $this->fail('washer_ids', 'Choose washers from the list of active washers.');
        }

        return array_map(fn (string $id) => $found[$id], array_values($ids));
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: Customer|null, 1: string|null}
     */
    private function findCustomer(string $branchId, array $data): array
    {
        $plate = PlateNumber::normalise($data['plate_number'] ?? null);
        $customers = Customer::query()->where('branch_id', $branchId);

        if (! empty($data['customer_id'])) {
            $customer = $customers->find($data['customer_id']);

            if (! $customer) {
                $this->fail('customer_id', 'This customer could not be found.');
            }

            return [$customer, $plate ?? $customer->plate_number];
        }

        // A plate that matches a saved customer links the sale to them.
        return [$plate ? $customers->where('plate_number', $plate)->first() : null, $plate];
    }

    /**
     * @throws ValidationException
     */
    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }
}
