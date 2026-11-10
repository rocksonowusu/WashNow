<?php

use App\Models\Customer;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;

/**
 * Push outbox items as the given user. Each item is [op, table, record].
 */
function syncPush(User $as, array ...$items): TestResponse
{
    Sanctum::actingAs($as);

    return test()->postJson('/api/sync/push', [
        'items' => array_map(fn (array $item) => ['op' => $item[0], 'table' => $item[1], 'record' => $item[2]], $items),
    ]);
}

/**
 * A sale as a device would have stored it offline.
 */
function saleRecord(stdClass $bay, array $overrides = []): array
{
    return $overrides + [
        'id' => (string) Str::uuid7(),
        'category_id' => $bay->sedan->id,
        'amount' => 5000,
        'payment_method' => 'cash',
        'washer_ids' => [$bay->kofi->id],
        'sold_at' => now()->toIso8601String(),
        'status' => 'active',
        'version' => 1,
    ];
}

function expenseRecord(array $overrides = []): array
{
    return $overrides + [
        'id' => (string) Str::uuid7(),
        'category' => 'soap',
        'amount' => 2000,
        'payment_method' => 'cash',
        'spent_at' => now()->toIso8601String(),
        'version' => 1,
    ];
}

describe('sales', function () {
    it('stores a sale recorded offline under the id the device gave it', function () {
        $bay = bay();
        $record = saleRecord($bay, ['amount' => 10000, 'washer_ids' => [$bay->kofi->id, $bay->ama->id]]);

        syncPush($bay->cashier, ['upsert', 'sales', $record])
            ->assertOk()
            ->assertExactJson(['accepted' => [$record['id']], 'rejected' => []]);

        $sale = Sale::query()->findOrFail($record['id']);

        expect($sale->amount)->toBe(10000)
            ->and($sale->recorded_by)->toBe($bay->cashier->id)
            ->and($sale->saleWashers()->sum('commission_amount'))->toEqual(3500); // server works out commission
    });

    it('is harmless to push the same sale twice', function () {
        $bay = bay();
        $record = saleRecord($bay, ['plate_number' => 'GR 1234-21', 'service_note' => 'body']);

        syncPush($bay->cashier, ['upsert', 'sales', $record])->assertJsonPath('accepted', [$record['id']]);
        syncPush($bay->cashier, ['upsert', 'sales', $record])
            ->assertOk()
            ->assertExactJson(['accepted' => [$record['id']], 'rejected' => []]);

        expect(Sale::query()->count())->toBe(1)
            ->and(SaleWasher::query()->count())->toBe(1)
            ->and(Sale::query()->sole()->version)->toBe(1);
    });

    it('applies the good records in a batch and reports the bad ones', function () {
        $bay = bay();
        $good = saleRecord($bay);
        $tooHigh = saleRecord($bay, ['amount' => 12000]);
        $alsoGood = saleRecord($bay, ['amount' => 3000]);

        $response = syncPush(
            $bay->cashier,
            ['upsert', 'sales', $good],
            ['upsert', 'sales', $tooHigh],
            ['upsert', 'sales', $alsoGood],
        )->assertOk();

        $response->assertJsonPath('accepted', [$good['id'], $alsoGood['id']])
            ->assertJsonCount(1, 'rejected')
            ->assertJsonPath('rejected.0.id', $tooHigh['id'])
            ->assertJsonPath('rejected.0.table', 'sales')
            ->assertJsonPath('rejected.0.reason', 'invalid');

        expect($response->json('rejected.0.message'))->toContain('outside the Sedan range')
            ->and(Sale::query()->count())->toBe(2)
            ->and(Sale::query()->find($tooHigh['id']))->toBeNull();
    });

    it('lets the higher version of an owner correction win and re-splits commission', function () {
        $bay = bay();
        $record = saleRecord($bay, ['amount' => 5000]);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        syncPush($bay->owner, ['upsert', 'sales', ['amount' => 6000, 'version' => 2] + $record])
            ->assertJsonPath('accepted', [$record['id']]);

        $sale = Sale::query()->find($record['id']);

        expect($sale->amount)->toBe(6000)
            ->and($sale->version)->toBe(2)
            ->and($sale->saleWashers()->sole()->commission_amount)->toBe(1800);
    });

    it('does not let a cashier change or void a recorded sale', function () {
        $bay = bay();
        $record = saleRecord($bay);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        syncPush($bay->cashier, ['upsert', 'sales', ['amount' => 6000, 'version' => 2] + $record])
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        syncPush($bay->cashier, ['upsert', 'sales', ['status' => 'voided', 'void_reason' => 'Mistake', 'version' => 2] + $record])
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        $sale = Sale::query()->find($record['id']);

        expect($sale->amount)->toBe(5000)->and($sale->isVoided())->toBeFalse();
    });

    it('rejects a sale dated inside a closed day', function () {
        $this->travelTo('2026-11-11 09:00:00');
        $bay = bay();
        Sanctum::actingAs($bay->owner);
        $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertCreated();

        // Recorded offline yesterday afternoon, synced this morning.
        $late = saleRecord($bay, ['sold_at' => '2026-11-10T16:30:00+00:00']);
        $today = saleRecord($bay);

        syncPush($bay->cashier, ['upsert', 'sales', $late], ['upsert', 'sales', $today])
            ->assertOk()
            ->assertJsonPath('accepted', [$today['id']])
            ->assertJsonPath('rejected.0.id', $late['id'])
            ->assertJsonPath('rejected.0.reason', 'day_closed');

        expect(Sale::query()->find($late['id']))->toBeNull();
    });
});

describe('a void always wins over an edit', function () {
    it('refuses an edit to a sale that is already voided, even with a higher version', function () {
        $bay = bay();
        $record = saleRecord($bay, ['amount' => 5000]);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$record['id']}/void", ['reason' => 'Entered twice'])->assertOk();

        // Another owner device edited the same sale while offline.
        syncPush($bay->owner, ['upsert', 'sales', ['amount' => 6000, 'version' => 9] + $record])
            ->assertOk()
            ->assertJsonPath('accepted', [])
            ->assertJsonPath('rejected.0.reason', 'voided')
            ->assertJsonPath('rejected.0.server_record.status', 'voided')
            ->assertJsonPath('rejected.0.server_record.amount', 5000);

        $sale = Sale::query()->find($record['id']);

        expect($sale->isVoided())->toBeTrue()->and($sale->amount)->toBe(5000);
    });

    it('applies a void even when the server copy has newer edits', function () {
        $bay = bay();
        $record = saleRecord($bay, ['amount' => 5000]);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        // The server copy moves on to version 3.
        Sanctum::actingAs($bay->owner);
        $this->putJson("/api/sales/{$record['id']}", ['amount' => 6000])->assertOk();
        $this->putJson("/api/sales/{$record['id']}", ['amount' => 7000])->assertOk();

        // A device that only knew version 1 voided it offline.
        syncPush($bay->owner, ['upsert', 'sales', ['status' => 'voided', 'void_reason' => 'Customer left', 'version' => 2] + $record])
            ->assertJsonPath('accepted', [$record['id']]);

        $sale = Sale::query()->find($record['id']);

        expect($sale->isVoided())->toBeTrue()
            ->and($sale->void_reason)->toBe('Customer left')
            ->and($sale->version)->toBe(4);
    });

    it('accepts the same void twice', function () {
        $bay = bay();
        $record = saleRecord($bay);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        $void = ['status' => 'voided', 'void_reason' => 'Entered twice', 'version' => 2] + $record;

        syncPush($bay->owner, ['upsert', 'sales', $void])->assertJsonPath('accepted', [$record['id']]);
        syncPush($bay->owner, ['upsert', 'sales', $void])->assertJsonPath('accepted', [$record['id']]);

        expect(Sale::query()->find($record['id'])->version)->toBe(2);
    });
});

describe('expenses: higher version wins, ties go to the server', function () {
    it('applies a higher version', function () {
        $bay = bay();
        $record = expenseRecord(['amount' => 2000]);
        syncPush($bay->cashier, ['upsert', 'expenses', $record])->assertJsonPath('accepted', [$record['id']]);

        syncPush($bay->owner, ['upsert', 'expenses', ['amount' => 2500, 'version' => 2] + $record])
            ->assertJsonPath('accepted', [$record['id']]);

        $expense = Expense::query()->find($record['id']);

        expect($expense->amount)->toBe(2500)->and($expense->version)->toBe(2);
    });

    it('rejects a lower or equal version and sends back the server copy', function (int $version) {
        $bay = bay();
        $record = expenseRecord(['amount' => 2000]);
        syncPush($bay->cashier, ['upsert', 'expenses', $record]);

        // The server copy is corrected twice: now version 3, GH₵30.
        Sanctum::actingAs($bay->owner);
        $this->putJson("/api/expenses/{$record['id']}", ['amount' => 2500])->assertOk();
        $this->putJson("/api/expenses/{$record['id']}", ['amount' => 3000])->assertOk();

        syncPush($bay->owner, ['upsert', 'expenses', ['amount' => 9900, 'version' => $version] + $record])
            ->assertOk()
            ->assertJsonPath('accepted', [])
            ->assertJsonPath('rejected.0.reason', 'stale')
            ->assertJsonPath('rejected.0.server_record.amount', 3000)
            ->assertJsonPath('rejected.0.server_record.version', 3);

        expect(Expense::query()->find($record['id'])->amount)->toBe(3000);
    })->with(['lower' => 2, 'tie' => 3]);

    it('is harmless to push the same expense twice', function () {
        $bay = bay();
        $record = expenseRecord();

        syncPush($bay->cashier, ['upsert', 'expenses', $record]);
        syncPush($bay->cashier, ['upsert', 'expenses', $record])
            ->assertExactJson(['accepted' => [$record['id']], 'rejected' => []]);

        expect(Expense::query()->count())->toBe(1);
    });

    it('lets only the owner change or remove an expense', function () {
        $bay = bay();
        $record = expenseRecord();
        syncPush($bay->cashier, ['upsert', 'expenses', $record]);

        syncPush($bay->cashier, ['upsert', 'expenses', ['amount' => 1, 'version' => 2] + $record])
            ->assertJsonPath('rejected.0.reason', 'forbidden');
        syncPush($bay->cashier, ['delete', 'expenses', ['id' => $record['id']]])
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        syncPush($bay->owner, ['delete', 'expenses', ['id' => $record['id']]])
            ->assertJsonPath('accepted', [$record['id']]);
        // Deleting again is fine.
        syncPush($bay->owner, ['delete', 'expenses', ['id' => $record['id']]])
            ->assertJsonPath('accepted', [$record['id']]);

        expect(Expense::withTrashed()->find($record['id'])->trashed())->toBeTrue();
    });
});

describe('customers merge field by field', function () {
    it('keeps changes two devices made to different fields', function () {
        $bay = bay();
        $customer = Customer::factory()->for($bay->branch)->create([
            'plate_number' => 'GR123421', 'name' => 'Mensah', 'phone' => '0244000000',
        ]);

        // Device A fixed the name, device B fixed the phone. Both started from version 1.
        syncPush($bay->cashier, ['upsert', 'customers', ['id' => $customer->id, 'name' => 'Mr Mensah', 'version' => 2]])
            ->assertJsonPath('accepted', [$customer->id]);
        syncPush($bay->owner, ['upsert', 'customers', ['id' => $customer->id, 'phone' => '0244111222', 'version' => 2]])
            ->assertJsonPath('accepted', [$customer->id]);

        $customer->refresh();

        expect($customer->name)->toBe('Mr Mensah')
            ->and($customer->phone)->toBe('0244111222')
            ->and($customer->plate_number)->toBe('GR123421');
    });

    it('never takes visit count or total spent from a device', function () {
        $bay = bay();
        $id = (string) Str::uuid7();

        syncPush($bay->cashier, ['upsert', 'customers', [
            'id' => $id, 'plate_number' => 'gw 55-22', 'name' => 'Akos', 'visit_count' => 50, 'total_spent' => 999999,
        ]])->assertJsonPath('accepted', [$id]);

        $customer = Customer::query()->find($id);

        expect($customer->plate_number)->toBe('GW5522')
            ->and($customer->visit_count)->toBe(0)
            ->and($customer->total_spent)->toBe(0);
    });

    it('points a second device at the existing customer when both added the same plate', function () {
        $bay = bay();
        $first = Customer::factory()->for($bay->branch)->create(['plate_number' => 'GR123421']);

        $localCustomerId = (string) Str::uuid7();
        $sale = saleRecord($bay, ['customer_id' => $localCustomerId, 'plate_number' => 'GR-1234-21']);

        $response = syncPush(
            $bay->cashier,
            ['upsert', 'customers', ['id' => $localCustomerId, 'plate_number' => 'GR 1234 21', 'name' => 'Duplicate']],
            ['upsert', 'sales', $sale],
        )->assertOk();

        $response->assertJsonPath('accepted', [$sale['id']])
            ->assertJsonPath('rejected.0.id', $localCustomerId)
            ->assertJsonPath('rejected.0.reason', 'duplicate_plate')
            ->assertJsonPath('rejected.0.server_record.id', $first->id);

        // The sale is not lost: it is linked to the customer that was there first.
        expect(Customer::query()->count())->toBe(1)
            ->and(Sale::query()->find($sale['id'])->customer_id)->toBe($first->id)
            ->and($first->fresh()->visit_count)->toBe(1);
    });
});

describe('settings are owner-only and the server wins', function () {
    it('refuses settings changes from a cashier', function () {
        $bay = bay();

        syncPush(
            $bay->cashier,
            ['upsert', 'vehicle_categories', ['id' => $bay->sedan->id, 'max_price' => 99900, 'version' => 2]],
            ['upsert', 'washers', ['id' => $bay->kofi->id, 'commission_percent' => 90, 'version' => 2]],
            ['delete', 'washers', ['id' => $bay->ama->id]],
        )->assertJsonPath('accepted', [])->assertJsonCount(3, 'rejected')
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        expect($bay->sedan->fresh()->max_price)->toBe(10000)
            ->and($bay->kofi->fresh()->commission_percent)->toBe('30.00')
            ->and(Washer::query()->find($bay->ama->id))->not->toBeNull();
    });

    it('applies an owner change made on top of the latest copy', function () {
        $bay = bay();
        $newWasherId = (string) Str::uuid7();

        syncPush(
            $bay->owner,
            ['upsert', 'vehicle_categories', ['id' => $bay->sedan->id, 'max_price' => 12000, 'version' => 2]],
            ['upsert', 'washers', ['id' => $newWasherId, 'name' => 'Yaw', 'commission_percent' => 25]],
        )->assertJsonPath('accepted', [$bay->sedan->id, $newWasherId]);

        expect($bay->sedan->fresh()->max_price)->toBe(12000)
            ->and($bay->sedan->fresh()->version)->toBe(2)
            ->and(Washer::query()->find($newWasherId)->branch_id)->toBe($bay->branch->id);
    });

    it('keeps the server copy when the owner\'s device was out of date', function () {
        $bay = bay();

        // Changed on the server first: version 2.
        Sanctum::actingAs($bay->owner);
        $this->putJson("/api/washers/{$bay->kofi->id}", ['commission_percent' => 35])->assertOk();

        // The offline device also thought it was making version 2.
        syncPush($bay->owner, ['upsert', 'washers', ['id' => $bay->kofi->id, 'commission_percent' => 50, 'version' => 2]])
            ->assertJsonPath('rejected.0.reason', 'stale')
            ->assertJsonPath('rejected.0.server_record.commission_percent', '35.00');

        expect($bay->kofi->fresh()->commission_percent)->toBe('35.00');
    });
});

describe('guard rails', function () {
    it('refuses tables that only the server may write', function (string $table) {
        $bay = bay();

        syncPush($bay->owner, ['upsert', $table, ['id' => (string) Str::uuid7(), 'role' => 'owner', 'name' => 'X']])
            ->assertOk()
            ->assertJsonPath('accepted', [])
            ->assertJsonPath('rejected.0.reason', 'unknown_table');
    })->with(['users', 'branches', 'day_closings', 'sale_washers', 'audit_logs']);

    it('refuses an unknown operation', function () {
        $bay = bay();

        syncPush($bay->owner, ['truncate', 'sales', ['id' => (string) Str::uuid7()]])
            ->assertJsonPath('rejected.0.reason', 'unknown_op');
        syncPush($bay->owner, ['delete', 'sales', ['id' => (string) Str::uuid7()]])
            ->assertJsonPath('rejected.0.reason', 'unknown_op');
    });

    it('never touches a record that belongs to another bay', function () {
        $bay = bay();
        $other = bay();
        $theirSale = saleRecord($other);
        syncPush($other->cashier, ['upsert', 'sales', $theirSale]);

        syncPush(
            $bay->owner,
            ['upsert', 'sales', ['status' => 'voided', 'void_reason' => 'Sabotage', 'version' => 2] + $theirSale],
            ['upsert', 'vehicle_categories', ['id' => $other->sedan->id, 'max_price' => 1, 'min_price' => 0, 'version' => 2]],
        )->assertJsonPath('accepted', [])
            ->assertJsonPath('rejected.0.reason', 'forbidden')
            ->assertJsonPath('rejected.0.server_record', null)
            ->assertJsonPath('rejected.1.reason', 'forbidden');

        expect(Sale::query()->find($theirSale['id'])->isVoided())->toBeFalse()
            ->and(VehicleCategory::query()->find($other->sedan->id)->max_price)->toBe(10000);
    });

    it('takes at most 50 records at a time and needs an id on each', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $items = array_map(fn () => ['op' => 'upsert', 'table' => 'expenses', 'record' => expenseRecord()], range(1, 51));

        $this->postJson('/api/sync/push', ['items' => $items])->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->postJson('/api/sync/push', ['items' => [['op' => 'upsert', 'table' => 'expenses', 'record' => ['amount' => 5]]]])
            ->assertUnprocessable();
        $this->postJson('/api/sync/push', ['items' => array_slice($items, 0, 50)])
            ->assertOk()->assertJsonCount(50, 'accepted');
    });

    it('needs a token', function () {
        $this->postJson('/api/sync/push', ['items' => []])->assertUnauthorized();
        $this->getJson('/api/sync/pull')->assertUnauthorized();
    });
});
