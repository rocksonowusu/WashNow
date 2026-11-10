<?php

namespace App\Sync\Handlers;

use App\Models\Expense;
use App\Models\User;
use App\Services\ExpenseService;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Validator;

/**
 * Anyone can add an expense; only the owner can correct or remove one.
 * Higher version wins, ties go to the server.
 */
class ExpenseHandler extends SyncHandler
{
    public function __construct(private readonly ExpenseService $expenses) {}

    public function upsert(User $user, array $record): void
    {
        $expense = Expense::withTrashed()->find($record['id']);
        $this->sameBranch($user, $expense);

        if (! $expense) {
            $data = Validator::make($record, ExpenseService::rules())->validate();
            $data['id'] = $record['id'];

            $this->raiseVersion($this->expenses->create($user, $data), $record);

            return;
        }

        $this->notDeleted($expense);

        $changes = Validator::make($record, ExpenseService::rules(creating: false))->validate();
        $changes = Arr::only($changes, ExpenseService::EDITABLE);

        // Compare times as times, whatever offset the device sent.
        $probe = $changes;
        if (isset($probe['spent_at'])) {
            $probe['spent_at'] = ExpenseService::spentAt($probe['spent_at']);
        } else {
            unset($probe['spent_at']);
        }

        if (! (clone $expense)->fill($probe)->isDirty()) {
            return;
        }

        $this->ownerOnly($user, 'Only the owner can change a recorded expense.');
        $this->ensureNewer($expense, $record);

        $expense->version = $this->incomingVersion($record);
        $this->expenses->update($expense, $changes);
    }

    public function delete(User $user, array $record): void
    {
        $expense = Expense::withTrashed()->find($record['id']);
        $this->sameBranch($user, $expense);

        // Unknown or already removed: nothing left to do.
        if (! $expense || $expense->trashed()) {
            return;
        }

        $this->ownerOnly($user, 'Only the owner can remove an expense.');
        $this->expenses->delete($expense);
    }
}
