<?php

namespace App\Sync\Handlers;

use App\Models\User;
use App\Models\Washer;
use App\Services\CrewService;
use App\Support\SettingRules;
use App\Sync\IdAliases;
use App\Sync\Rejection;

/**
 * Crew members. Anyone can add one (a cashier's addition starts on the bay's
 * standard commission); only the owner can change or remove one, and then the
 * server wins if the owner's device was out of date.
 */
class WasherHandler extends SyncHandler
{
    public function __construct(
        private readonly CrewService $crew,
        private readonly IdAliases $aliases,
    ) {}

    public function upsert(User $user, array $record): void
    {
        $washer = Washer::withTrashed()->find($record['id']);
        $this->sameBranch($user, $washer);

        if (! $washer) {
            // Two devices can add the same person while offline. The first one
            // in wins; the second is told which crew member to use instead.
            $clash = isset($record['name']) && is_string($record['name'])
                ? $this->crew->findByName($user->branch_id, $record['name'])
                : null;

            if ($clash) {
                $this->aliases->add($record['id'], $clash->id);

                throw new Rejection('duplicate_name', "{$clash->name} is already on the crew list.", $clash);
            }

            $this->raiseVersion($this->crew->create($user, $record, $record['id']), $record);

            return;
        }

        $this->notDeleted($washer);

        // A cashier's own addition arriving again after a dropped connection.
        $sameName = isset($record['name']) && is_string($record['name'])
            && mb_strtolower(CrewService::cleanName($record['name'])) === mb_strtolower($washer->name);

        if (! $user->isOwner() && $sameName) {
            return;
        }

        $this->ownerOnly($user, 'Only the owner can change a crew member.');

        $changes = SettingRules::washer($record, creating: false);
        if (isset($changes['name'])) {
            $changes['name'] = CrewService::cleanName($changes['name']);
        }

        $probe = (clone $washer)->fill($changes);

        if (! $probe->isDirty()) {
            return;
        }

        $this->ensureNewer($washer, $record);

        $probe->version = $this->incomingVersion($record);
        $probe->save();
    }

    public function delete(User $user, array $record): void
    {
        $this->ownerOnly($user, 'Only the owner can remove a crew member.');

        $washer = Washer::withTrashed()->find($record['id']);
        $this->sameBranch($user, $washer);

        if ($washer && ! $washer->trashed()) {
            $washer->delete();
        }
    }
}
