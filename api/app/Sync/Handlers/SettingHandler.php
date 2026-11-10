<?php

namespace App\Sync\Handlers;

use App\Http\Controllers\Api\VehicleCategoryController;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use App\Support\SettingRules;
use Illuminate\Database\Eloquent\Model;

/**
 * Vehicle categories and washers: owner only, and the server wins. An owner's
 * change is applied only when it was made on top of the server's latest copy.
 */
class SettingHandler extends SyncHandler
{
    /**
     * @param  class-string<VehicleCategory|Washer>  $model
     */
    public function __construct(private readonly string $model) {}

    public function upsert(User $user, array $record): void
    {
        $this->ownerOnly($user, 'Only the owner can change settings.');

        $existing = $this->model::withTrashed()->find($record['id']);
        $this->sameBranch($user, $existing);

        if (! $existing) {
            $created = new $this->model(['branch_id' => $user->branch_id] + $this->validated($user, $record, null));
            $created->id = $record['id'];
            $created->save();

            $this->raiseVersion($created, $record);

            return;
        }

        $this->notDeleted($existing);

        $probe = (clone $existing)->fill($this->validated($user, $record, $existing));

        if (! $probe->isDirty()) {
            return;
        }

        $this->ensureNewer($existing, $record);

        $probe->version = $this->incomingVersion($record);
        $probe->save();
    }

    public function delete(User $user, array $record): void
    {
        $this->ownerOnly($user, 'Only the owner can change settings.');

        $existing = $this->model::withTrashed()->find($record['id']);
        $this->sameBranch($user, $existing);

        if ($existing && ! $existing->trashed()) {
            $existing->delete();
        }
    }

    /**
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>
     */
    private function validated(User $user, array $record, ?Model $existing): array
    {
        if ($this->model === Washer::class) {
            return SettingRules::washer($record, creating: $existing === null);
        }

        $current = $existing ? $existing->only(VehicleCategoryController::FIELDS) : [];

        return SettingRules::category(array_merge($current, $record), $user->branch_id, $existing?->getKey());
    }
}
