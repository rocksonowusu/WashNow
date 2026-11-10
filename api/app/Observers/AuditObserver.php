<?php

namespace App\Observers;

use App\Enums\SaleStatus;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Sale;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;

/**
 * Writes one audit_logs row for every create, change, void, delete and restore
 * of a synced model: who did it, and the values before and after.
 */
class AuditObserver
{
    /** Bookkeeping columns that change on every save and say nothing useful. */
    private const IGNORED = ['version', 'created_at', 'updated_at', 'deleted_at'];

    /** Columns the server recalculates itself; not a person's action. */
    private const DERIVED = [
        Customer::class => ['visit_count', 'total_spent'],
    ];

    public function created(Model $model): void
    {
        $this->log($model, 'created', null, $this->clean($model, $model->getAttributes()));
    }

    public function updated(Model $model): void
    {
        $changes = Arr::except(
            $model->getChanges(),
            [...self::IGNORED, ...(self::DERIVED[$model::class] ?? [])],
        );

        if ($changes === []) {
            return;
        }

        $before = [];
        foreach (array_keys($changes) as $key) {
            $before[$key] = $model->getRawOriginal($key);
        }

        $voided = $model instanceof Sale && ($changes['status'] ?? null) === SaleStatus::Voided->value;

        $this->log(
            $model,
            $voided ? 'voided' : 'updated',
            $this->clean($model, $before),
            $this->clean($model, $changes),
        );
    }

    public function deleted(Model $model): void
    {
        $this->log($model, 'deleted', $this->clean($model, $model->getAttributes()), null);
    }

    public function restored(Model $model): void
    {
        $this->log($model, 'restored', null, $this->clean($model, $model->getAttributes()));
    }

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     */
    private function log(Model $model, string $action, ?array $before, ?array $after): void
    {
        AuditLog::query()->create([
            'branch_id' => $model instanceof Branch ? $model->getKey() : $model->getAttribute('branch_id'),
            'user_id' => Auth::id(),
            'action' => $action,
            'table_name' => $model->getTable(),
            'record_id' => $model->getKey(),
            'before' => $before,
            'after' => $after,
        ]);
    }

    /**
     * Never copy secrets such as the PIN hash into the log; record only that
     * they changed.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function clean(Model $model, array $values): array
    {
        $values = Arr::except($values, self::IGNORED);

        foreach ($model->getHidden() as $hidden) {
            if (array_key_exists($hidden, $values)) {
                $values[$hidden] = '[hidden]';
            }
        }

        return $values;
    }
}
