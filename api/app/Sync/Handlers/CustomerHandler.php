<?php

namespace App\Sync\Handlers;

use App\Models\Customer;
use App\Models\User;
use App\Support\PlateNumber;
use App\Sync\Rejection;
use Illuminate\Support\Facades\Validator;

/**
 * Customers merge field by field: a device sends only the fields it changed,
 * and those are laid over the server's copy. Two people editing different
 * fields of the same customer both keep their change. visit_count and
 * total_spent are never accepted; the server counts them from sales.
 */
class CustomerHandler extends SyncHandler
{
    public function upsert(User $user, array $record): void
    {
        $customer = Customer::withTrashed()->find($record['id']);
        $this->sameBranch($user, $customer);

        if (array_key_exists('plate_number', $record)) {
            $record['plate_number'] = PlateNumber::normalise($record['plate_number']);
        }

        $data = Validator::make($record, [
            'plate_number' => [$customer ? 'sometimes' : 'required', 'string', 'max:20'],
            'name' => ['sometimes', 'nullable', 'string', 'max:100'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ])->validate();

        if (isset($data['plate_number'])) {
            // Two devices can add the same car while offline. The first one in
            // wins; the second is told which customer to use instead.
            $clash = Customer::withTrashed()
                ->where('branch_id', $user->branch_id)
                ->where('plate_number', $data['plate_number'])
                ->whereKeyNot($record['id'])
                ->first();

            if ($clash) {
                throw new Rejection('duplicate_plate', 'A customer with this plate number already exists.', $clash);
            }
        }

        if (! $customer) {
            $customer = new Customer(['branch_id' => $user->branch_id] + $data);
            $customer->id = $record['id'];
            $customer->save();

            return;
        }

        $this->notDeleted($customer);
        $customer->update($data);
    }

    public function delete(User $user, array $record): void
    {
        $customer = Customer::withTrashed()->find($record['id']);
        $this->sameBranch($user, $customer);

        if (! $customer || $customer->trashed()) {
            return;
        }

        $this->ownerOnly($user, 'Only the owner can remove a customer.');
        $customer->delete();
    }
}
