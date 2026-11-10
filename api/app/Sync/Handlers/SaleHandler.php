<?php

namespace App\Sync\Handlers;

use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\User;
use App\Services\SaleService;
use App\Support\PlateNumber;
use App\Sync\IdAliases;
use App\Sync\Rejection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;

/**
 * Sales are append-only: anyone can add one, only the owner can correct or
 * void one, and a void always wins over an edit.
 */
class SaleHandler extends SyncHandler
{
    public function __construct(
        private readonly SaleService $sales,
        private readonly IdAliases $aliases,
    ) {}

    public function upsert(User $user, array $record): void
    {
        $sale = Sale::withTrashed()->find($record['id']);
        $this->sameBranch($user, $sale);

        $wantsVoid = ($record['status'] ?? SaleStatus::Active->value) === SaleStatus::Voided->value;

        if (! $sale) {
            $this->create($user, $record, $wantsVoid);

            return;
        }

        if ($wantsVoid) {
            // Already voided: the same void arriving again changes nothing.
            if (! $sale->isVoided()) {
                $this->ownerOnly($user, 'Only the owner can void a sale.');

                // No version check on purpose: a void beats any edit.
                $sale->version = max($this->incomingVersion($record), $sale->version + 1);
                $this->sales->void($sale, $this->voidReason($record));
            }

            return;
        }

        $changes = Validator::make($record, SaleService::rules(creating: false))->validate();
        $changes = Arr::only($changes, SaleService::EDITABLE);

        if (array_key_exists('plate_number', $changes)) {
            $changes['plate_number'] = PlateNumber::normalise($changes['plate_number']);
        }

        // The same sale arriving again (a retry after a dropped connection)
        // matches what is stored, and is simply accepted.
        if (! (clone $sale)->fill($changes)->isDirty()) {
            return;
        }

        if ($sale->isVoided()) {
            throw new Rejection('voided', 'This sale was voided, so the change was not applied.', $sale);
        }

        $this->ownerOnly($user, 'Only the owner can change a recorded sale.');
        $this->ensureNewer($sale, $record);

        $sale->version = $this->incomingVersion($record);
        $this->sales->update($user, $sale, $changes);
    }

    /**
     * @param  array<string, mixed>  $record
     */
    private function create(User $user, array $record, bool $wantsVoid): void
    {
        $data = Validator::make($record, SaleService::rules(), [
            'washer_ids.required' => 'Choose at least one washer.',
        ])->validate();

        $data['id'] = $record['id'];

        // A crew member added offline earlier in this batch may already have
        // existed; use the surviving one.
        $data['washer_ids'] = array_values(array_unique(array_map(
            fn (string $id) => $this->aliases->resolve($id),
            $data['washer_ids'],
        )));

        // The device may point at a customer it created offline whose plate
        // turned out to exist already. Fall back to matching by plate.
        if (! empty($data['customer_id']) && ! empty($data['plate_number'])) {
            $known = Customer::query()
                ->where('branch_id', $user->branch_id)
                ->whereKey($data['customer_id'])
                ->exists();

            if (! $known) {
                unset($data['customer_id']);
            }
        }

        if ($wantsVoid) {
            $this->ownerOnly($user, 'Only the owner can void a sale.');
        }

        $sale = $this->sales->create($user, $data);

        if ($wantsVoid) {
            $this->sales->void($sale, $this->voidReason($record));
        }

        $this->raiseVersion($sale, $record);
    }

    /**
     * @param  array<string, mixed>  $record
     */
    private function voidReason(array $record): string
    {
        return Validator::make($record, [
            'void_reason' => ['required', 'string', 'min:3', 'max:255'],
        ])->validate()['void_reason'];
    }
}
