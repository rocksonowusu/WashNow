<?php

namespace App\Services;

use App\Enums\PaymentMethod;
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
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SaleService
{
    /** The only fields an owner may change after a sale is recorded. */
    public const EDITABLE = ['amount', 'payment_method', 'service_note', 'plate_number', 'override_reason'];

    /**
     * Shape rules shared by the REST endpoints and sync. amount is whole
     * pesewas: GH₵35.00 is 3500.
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(bool $creating = true): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        $editable = [
            'amount' => [$presence, 'integer', 'min:1', 'max:100000000'],
            'payment_method' => [$presence, Rule::enum(PaymentMethod::class)],
            'service_note' => ['nullable', 'string', 'max:255'],
            'plate_number' => ['nullable', 'string', 'max:20'],
            'override_reason' => ['nullable', 'string', 'max:255'],
        ];

        if (! $creating) {
            return $editable;
        }

        return $editable + [
            'category_id' => ['required', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'washer_ids' => ['required', 'array', 'min:1', 'max:6'],
            'washer_ids.*' => ['uuid', 'distinct'],
            'sold_at' => ['nullable', 'date'],
        ];
    }

    /**
     * @param  array<string, mixed>  $data  Already validated for shape with rules().
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
     * An owner's correction to a recorded sale. Washers, category and time
     * cannot be changed; void and record again for those.
     *
     * @param  array<string, mixed>  $data  Already validated with rules(creating: false).
     *
     * @throws ValidationException
     */
    public function update(User $user, Sale $sale, array $data): Sale
    {
        return DB::transaction(function () use ($user, $sale, $data): Sale {
            if ($sale->isVoided()) {
                $this->fail('amount', 'A voided sale cannot be changed.');
            }

            DayLock::ensureOpen($sale->branch_id, $sale->sold_at, 'sold_at');

            $previousCustomerId = $sale->customer_id;

            if (array_key_exists('amount', $data) && (int) $data['amount'] !== $sale->amount) {
                $category = VehicleCategory::withTrashed()->findOrFail($sale->category_id);
                $amount = (int) $data['amount'];

                $sale->override_reason = $this->checkPrice(
                    $user, $category, $amount, $data['override_reason'] ?? $sale->override_reason,
                );
                $sale->amount = $amount;
            }

            if (array_key_exists('payment_method', $data)) {
                $sale->payment_method = $data['payment_method'];
            }

            if (array_key_exists('service_note', $data)) {
                $sale->service_note = $data['service_note'];
            }

            if (array_key_exists('plate_number', $data)) {
                $plate = PlateNumber::normalise($data['plate_number']);

                $sale->plate_number = $plate;
                $sale->customer_id = $plate === null ? null : Customer::query()
                    ->where('branch_id', $sale->branch_id)
                    ->where('plate_number', $plate)
                    ->value('id');
            }

            $sale->save();

            if ($sale->wasChanged('amount')) {
                $this->resplitCommission($sale);
            }

            CustomerStats::recalculate($previousCustomerId);

            if ($sale->customer_id !== $previousCustomerId) {
                CustomerStats::recalculate($sale->customer_id);
            }

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
        $rows = [];

        foreach ($washers as $index => $washer) {
            $rows[] = [
                'washer_id' => $washer->id,
                'commission_percent' => $washer->commission_percent,
                'commission_amount' => $this->commissionFor($amount, count($washers), $index, $washer->commission_percent),
            ];
        }

        return $rows;
    }

    /**
     * After an amount correction: same washers, same snapshotted percentages,
     * new amounts.
     */
    private function resplitCommission(Sale $sale): void
    {
        // UUID v7 ids sort in the order the rows were created.
        $rows = $sale->saleWashers()->orderBy('id')->get();

        foreach ($rows as $index => $row) {
            $row->update([
                'commission_amount' => $this->commissionFor($sale->amount, $rows->count(), $index, $row->commission_percent),
            ]);
        }
    }

    private function commissionFor(int $amount, int $washerCount, int $index, string|float $percent): int
    {
        // Spare pesewas go to the first washers so the shares add up exactly.
        $share = intdiv($amount, $washerCount) + ($index < $amount % $washerCount ? 1 : 0);
        $basisPoints = (int) round(((float) $percent) * 100);

        return intdiv($share * $basisPoints + 5000, 10000);
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
