<?php

use App\Models\Customer;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->travelTo('2026-11-10 09:00:00');
});

it('sends everything in the bay on a first pull', function () {
    $bay = bay();
    $other = bay();
    Customer::factory()->for($bay->branch)->create();
    recordSale($bay, $bay->cashier, ['washer_ids' => [$bay->kofi->id, $bay->ama->id]])->assertCreated();
    recordSale($other, $other->cashier)->assertCreated();

    Sanctum::actingAs($bay->owner);
    $response = $this->getJson('/api/sync/pull')->assertOk();

    $response->assertJsonStructure(['cursor', 'tables' => [
        'branches', 'users', 'vehicle_categories', 'washers', 'customers',
        'sales', 'sale_washers', 'expenses', 'day_closings',
    ]]);

    $response->assertJsonCount(1, 'tables.branches')
        ->assertJsonPath('tables.branches.0.id', $bay->branch->id)
        ->assertJsonCount(2, 'tables.users')
        ->assertJsonCount(1, 'tables.vehicle_categories')
        ->assertJsonCount(2, 'tables.washers')
        ->assertJsonCount(1, 'tables.customers')
        ->assertJsonCount(1, 'tables.sales')
        ->assertJsonCount(2, 'tables.sale_washers');

    // Nothing from the other bay, and never a PIN hash.
    $branchIds = collect($response->json('tables'))->flatten(1)->pluck('branch_id')->filter()->unique()->values()->all();

    expect($branchIds)->toBe([$bay->branch->id])
        ->and($response->json('tables.users.0'))->not->toHaveKey('pin_hash');
});

it('sends only what changed since the cursor', function () {
    $bay = bay();
    recordSale($bay, $bay->cashier)->assertCreated();

    $this->travel(1)->minutes();
    Sanctum::actingAs($bay->owner);
    $cursor = $this->getJson('/api/sync/pull')->assertOk()->json('cursor');

    // Nothing has happened since.
    $this->travel(1)->minutes();
    $quiet = $this->getJson('/api/sync/pull?since='.urlencode($cursor))->assertOk();

    expect(collect($quiet->json('tables'))->flatten(1))->toBeEmpty();

    // One new sale and one changed washer.
    $newSaleId = recordSale($bay, $bay->cashier, ['amount' => 3000])->json('data.id');
    Sanctum::actingAs($bay->owner);
    $this->putJson("/api/washers/{$bay->ama->id}", ['commission_percent' => 45])->assertOk();

    $this->travel(1)->minutes();
    $this->getJson('/api/sync/pull?since='.urlencode($quiet->json('cursor')))
        ->assertOk()
        ->assertJsonCount(1, 'tables.sales')
        ->assertJsonPath('tables.sales.0.id', $newSaleId)
        ->assertJsonCount(1, 'tables.sale_washers')
        ->assertJsonCount(1, 'tables.washers')
        ->assertJsonPath('tables.washers.0.id', $bay->ama->id)
        ->assertJsonPath('tables.washers.0.commission_percent', '45.00')
        ->assertJsonPath('tables.washers.0.version', 2)
        ->assertJsonCount(0, 'tables.vehicle_categories')
        ->assertJsonCount(0, 'tables.users');
});

it('sends removed records so devices can remove them too', function () {
    $bay = bay();
    $customer = Customer::factory()->for($bay->branch)->create();

    $this->travel(1)->minutes();
    Sanctum::actingAs($bay->owner);
    $cursor = $this->getJson('/api/sync/pull')->json('cursor');

    $this->travel(1)->minutes();
    $this->deleteJson("/api/washers/{$bay->kofi->id}")->assertOk();
    $this->deleteJson("/api/customers/{$customer->id}")->assertOk();

    $response = $this->getJson('/api/sync/pull?since='.urlencode($cursor))->assertOk();

    $response->assertJsonCount(1, 'tables.washers')
        ->assertJsonPath('tables.washers.0.id', $bay->kofi->id)
        ->assertJsonPath('tables.washers.0.version', 2)
        ->assertJsonCount(1, 'tables.customers')
        ->assertJsonPath('tables.customers.0.id', $customer->id);

    expect($response->json('tables.washers.0.deleted_at'))->not->toBeNull()
        ->and($response->json('tables.customers.0.deleted_at'))->not->toBeNull();
});

it('sends a voided sale again with its new status', function () {
    $bay = bay();
    $saleId = recordSale($bay, $bay->cashier)->json('data.id');

    $this->travel(1)->minutes();
    Sanctum::actingAs($bay->owner);
    $cursor = $this->getJson('/api/sync/pull')->json('cursor');

    $this->travel(1)->minutes();
    $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Entered twice'])->assertOk();

    $this->getJson('/api/sync/pull?since='.urlencode($cursor))
        ->assertJsonCount(1, 'tables.sales')
        ->assertJsonPath('tables.sales.0.status', 'voided')
        ->assertJsonPath('tables.sales.0.void_reason', 'Entered twice');
});

it('never misses a change made in the same moment as the last pull', function () {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $cursor = $this->getJson('/api/sync/pull')->json('cursor');

    // Written in the very same second the pull happened.
    $saleId = recordSale($bay, $bay->cashier)->json('data.id');

    Sanctum::actingAs($bay->owner);
    $this->getJson('/api/sync/pull?since='.urlencode($cursor))
        ->assertJsonPath('tables.sales.0.id', $saleId);
});

it('sends a cashier today only, and no closing totals', function () {
    $bay = bay();
    recordSale($bay, $bay->cashier, ['sold_at' => '2026-11-09T15:00:00+00:00', 'amount' => 2000])->assertCreated();
    $todayId = recordSale($bay, $bay->cashier, ['amount' => 5000])->json('data.id');
    $this->postJson('/api/expenses', ['category' => 'soap', 'amount' => 1000, 'payment_method' => 'cash', 'spent_at' => '2026-11-09T12:00:00+00:00'])->assertCreated();
    $this->postJson('/api/expenses', ['category' => 'fuel', 'amount' => 3000, 'payment_method' => 'cash'])->assertCreated();

    Sanctum::actingAs($bay->owner);
    $this->postJson('/api/day-closings', ['date' => '2026-11-09'])->assertCreated();

    $this->getJson('/api/sync/pull')
        ->assertJsonCount(2, 'tables.sales')
        ->assertJsonCount(2, 'tables.sale_washers')
        ->assertJsonCount(2, 'tables.expenses')
        ->assertJsonCount(1, 'tables.day_closings');

    Sanctum::actingAs($bay->cashier);
    $this->getJson('/api/sync/pull')
        ->assertOk()
        ->assertJsonCount(1, 'tables.sales')
        ->assertJsonPath('tables.sales.0.id', $todayId)
        ->assertJsonCount(1, 'tables.sale_washers')
        ->assertJsonCount(1, 'tables.expenses')
        ->assertJsonPath('tables.expenses.0.category', 'fuel')
        ->assertJsonCount(0, 'tables.day_closings')
        // Still everything needed to record a sale.
        ->assertJsonCount(1, 'tables.vehicle_categories')
        ->assertJsonCount(2, 'tables.washers');
});

it('rejects a cursor that is not a date', function () {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $this->getJson('/api/sync/pull?since=yesterday-ish')->assertUnprocessable();
});
