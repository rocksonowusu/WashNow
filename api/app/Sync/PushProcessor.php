<?php

namespace App\Sync;

use App\Exceptions\DayClosedException;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use App\Sync\Handlers\CustomerHandler;
use App\Sync\Handlers\ExpenseHandler;
use App\Sync\Handlers\SaleHandler;
use App\Sync\Handlers\SettingHandler;
use App\Sync\Handlers\SyncHandler;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Applies one batch from a device's outbox. Every item is applied or rejected
 * on its own, so one bad record never blocks the rest. Applying the same item
 * twice is harmless.
 */
class PushProcessor
{
    /** Tables a device may push. Everything else is server-only. */
    public const TABLES = ['customers', 'sales', 'expenses', 'vehicle_categories', 'washers'];

    /**
     * @param  list<array{op: string, table: string, record: array<string, mixed>}>  $items
     * @return array{accepted: list<string>, rejected: list<array<string, mixed>>}
     */
    public function process(User $user, array $items): array
    {
        $accepted = [];
        $rejected = [];

        DB::transaction(function () use ($user, $items, &$accepted, &$rejected): void {
            foreach ($items as $item) {
                $id = $item['record']['id'];

                try {
                    // A nested transaction is a savepoint: if this item fails
                    // half-way, only its own writes are undone.
                    DB::transaction(fn () => $this->apply($user, $item));

                    $accepted[] = $id;
                } catch (Rejection $rejection) {
                    $rejected[] = $this->rejected($item, $rejection->reason, $rejection->getMessage())
                        + ['server_record' => $rejection->serverRecord?->fresh()?->toArray()];
                } catch (DayClosedException $exception) {
                    $rejected[] = $this->rejected($item, 'day_closed', $exception->getMessage());
                } catch (ValidationException $exception) {
                    $rejected[] = $this->rejected($item, 'invalid', $exception->getMessage())
                        + ['errors' => $exception->errors()];
                } catch (QueryException $exception) {
                    report($exception);
                    $rejected[] = $this->rejected($item, 'invalid', 'This record could not be saved.');
                }
            }
        });

        return ['accepted' => $accepted, 'rejected' => $rejected];
    }

    /**
     * @param  array{op: string, table: string, record: array<string, mixed>}  $item
     */
    private function apply(User $user, array $item): void
    {
        $handler = $this->handler($item['table']);

        match ($item['op']) {
            'upsert' => $handler->upsert($user, $item['record']),
            'delete' => $handler->delete($user, $item['record']),
            default => throw new Rejection('unknown_op', "Unknown operation [{$item['op']}]."),
        };
    }

    private function handler(string $table): SyncHandler
    {
        return match ($table) {
            'sales' => app(SaleHandler::class),
            'expenses' => app(ExpenseHandler::class),
            'customers' => app(CustomerHandler::class),
            'vehicle_categories' => new SettingHandler(VehicleCategory::class),
            'washers' => new SettingHandler(Washer::class),
            default => throw new Rejection('unknown_table', "Records in [{$table}] cannot be changed from a device."),
        };
    }

    /**
     * @param  array{op: string, table: string, record: array<string, mixed>}  $item
     * @return array<string, mixed>
     */
    private function rejected(array $item, string $reason, string $message): array
    {
        return [
            'id' => $item['record']['id'],
            'table' => $item['table'],
            'op' => $item['op'],
            'reason' => $reason,
            'message' => $message,
        ];
    }
}
