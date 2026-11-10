<?php

namespace App\Sync\Handlers;

use App\Models\User;
use App\Sync\Rejection;
use Illuminate\Database\Eloquent\Model;

abstract class SyncHandler
{
    /**
     * Create the record, or apply the device's change to it.
     *
     * @param  array<string, mixed>  $record
     */
    abstract public function upsert(User $user, array $record): void;

    /**
     * @param  array<string, mixed>  $record
     */
    public function delete(User $user, array $record): void
    {
        throw new Rejection('unknown_op', 'These records cannot be deleted.');
    }

    protected function ownerOnly(User $user, string $message): void
    {
        if (! $user->isOwner()) {
            throw new Rejection('forbidden', $message);
        }
    }

    /**
     * An id that already belongs to another bay must never be read or changed.
     */
    protected function sameBranch(User $user, ?Model $existing): void
    {
        if ($existing && $existing->getAttribute('branch_id') !== $user->branch_id) {
            throw new Rejection('forbidden', 'This record belongs to another branch.');
        }
    }

    /**
     * @param  array<string, mixed>  $record
     */
    protected function incomingVersion(array $record): int
    {
        return max(1, (int) ($record['version'] ?? 1));
    }

    /**
     * Higher version wins; a tie goes to the server.
     *
     * @param  array<string, mixed>  $record
     */
    protected function ensureNewer(Model $existing, array $record): void
    {
        if ($this->incomingVersion($record) <= $existing->getAttribute('version')) {
            throw new Rejection('stale', 'A newer version of this record is already on the server.', $existing);
        }
    }

    protected function notDeleted(Model $existing): void
    {
        if ($existing->trashed()) {
            throw new Rejection('deleted', 'This record has been removed on the server.', $existing);
        }
    }

    /**
     * After a create: if the device already counted further (created then
     * edited before syncing), carry its version over so both sides agree.
     *
     * @param  array<string, mixed>  $record
     */
    protected function raiseVersion(Model $model, array $record): void
    {
        $incoming = $this->incomingVersion($record);

        if ($incoming > $model->getAttribute('version')) {
            $model->setAttribute('version', $incoming);
            $model->save();
        }
    }
}
