<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Shared behaviour for every table that syncs with devices:
 *
 * - UUID v7 primary keys. Devices generate the id offline; the server only
 *   generates one when a record is created without it.
 * - `version` starts at 1 and goes up by one on every change, including a
 *   soft delete and a restore, so sync can tell which copy is newer.
 * - Soft deletes, so deletions can be sent to devices on the next pull.
 */
trait HasUuidSync
{
    use HasUuids, SoftDeletes;

    public static function bootHasUuidSync(): void
    {
        static::creating(function (Model $model): void {
            if ($model->getAttribute('version') === null) {
                $model->setAttribute('version', 1);
            }
        });

        static::updating(function (Model $model): void {
            // A caller (sync push) may set the version itself; otherwise bump it.
            if (! $model->isDirty('version')) {
                $model->setAttribute('version', $model->getAttribute('version') + 1);
            }
        });

        // A soft delete writes deleted_at with a direct query and never fires
        // "updating", so the version is bumped here instead.
        static::deleted(function (Model $model): void {
            if ($model->isForceDeleting()) {
                return;
            }

            $next = $model->getAttribute('version') + 1;

            $model->newQueryWithoutScopes()
                ->whereKey($model->getKey())
                ->toBase()
                ->update(['version' => $next]);

            $model->setAttribute('version', $next);
            $model->syncOriginalAttribute('version');
        });
    }

    public function initializeHasUuidSync(): void
    {
        $this->mergeCasts(['version' => 'integer']);
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid7();
    }
}
