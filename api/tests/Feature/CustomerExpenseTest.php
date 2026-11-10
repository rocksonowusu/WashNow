<?php

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Expense;
use Laravel\Sanctum\Sanctum;

describe('customers', function () {
    it('lets a cashier add and edit a customer', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $id = $this->postJson('/api/customers', ['plate_number' => 'gw 55-22', 'name' => 'Mr Mensah', 'phone' => '0244111222'])
            ->assertCreated()
            ->assertJsonPath('data.plate_number', 'GW5522')
            ->assertJsonPath('data.visit_count', 0)
            ->assertJsonPath('data.total_spent', 0)
            ->json('data.id');

        $this->putJson("/api/customers/{$id}", ['name' => 'Mr K. Mensah'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Mr K. Mensah')
            ->assertJsonPath('data.plate_number', 'GW5522');
    });

    it('rejects a plate number that is already saved, however it is typed', function () {
        $bay = bay();
        Customer::factory()->for($bay->branch)->create(['plate_number' => 'GW5522']);
        Sanctum::actingAs($bay->cashier);

        $this->postJson('/api/customers', ['plate_number' => 'GW-55 22'])
            ->assertUnprocessable()->assertJsonValidationErrors('plate_number');
    });

    it('ignores visit and spend totals sent by a device', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $this->postJson('/api/customers', ['plate_number' => 'GW5522', 'visit_count' => 99, 'total_spent' => 999999])
            ->assertCreated()
            ->assertJsonPath('data.visit_count', 0)
            ->assertJsonPath('data.total_spent', 0);
    });

    it('finds customers by plate, name or phone', function () {
        $bay = bay();
        Customer::factory()->for($bay->branch)->create(['plate_number' => 'GW5522', 'name' => 'Mr Mensah', 'phone' => '0244111222']);
        Customer::factory()->for($bay->branch)->create(['plate_number' => 'AS900123', 'name' => 'Auntie Akos', 'phone' => '0501234567']);
        Customer::factory()->create(['plate_number' => 'GW5599']); // another bay
        Sanctum::actingAs($bay->cashier);

        $this->getJson('/api/customers')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/customers?q=gw-55')->assertJsonCount(1, 'data')->assertJsonPath('data.0.plate_number', 'GW5522');
        $this->getJson('/api/customers?q=akos')->assertJsonCount(1, 'data')->assertJsonPath('data.0.plate_number', 'AS900123');
        $this->getJson('/api/customers?q=0244')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Mr Mensah');
    });

    it('lets only the owner remove a customer', function () {
        $bay = bay();
        $customer = Customer::factory()->for($bay->branch)->create();

        Sanctum::actingAs($bay->cashier);
        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();

        Sanctum::actingAs($bay->owner);
        $this->deleteJson("/api/customers/{$customer->id}")->assertOk();

        expect(Customer::withTrashed()->find($customer->id)->trashed())->toBeTrue();
    });

    it('does not fill the audit log with recalculated totals', function () {
        $bay = bay();
        $customer = Customer::factory()->for($bay->branch)->create();

        recordSale($bay, $bay->cashier, ['customer_id' => $customer->id])->assertCreated();

        expect($customer->fresh()->visit_count)->toBe(1)
            ->and(AuditLog::query()->where('record_id', $customer->id)->where('action', 'updated')->count())->toBe(0);
    });
});

describe('expenses', function () {
    it('lets a cashier record an expense', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $this->postJson('/api/expenses', ['category' => 'soap', 'amount' => 2500, 'payment_method' => 'cash', 'note' => '2 gallons'])
            ->assertCreated()
            ->assertJsonPath('data.category', 'soap')
            ->assertJsonPath('data.amount', 2500)
            ->assertJsonPath('data.recorded_by', $bay->cashier->id);

        $this->getJson('/api/expenses')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('totals.total', 2500);
    });

    it('rejects an unknown category, a zero amount or a future date', function (array $bad, string $field) {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $this->postJson('/api/expenses', $bad + ['category' => 'soap', 'amount' => 2500, 'payment_method' => 'cash'])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
    })->with([
        'unknown category' => [['category' => 'lunch'], 'category'],
        'zero amount' => [['amount' => 0], 'amount'],
        'card payment' => [['payment_method' => 'card'], 'payment_method'],
        'future date' => [['spent_at' => '2099-01-01T10:00:00+00:00'], 'spent_at'],
    ]);

    it('lets the owner correct and remove an expense', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);
        $id = $this->postJson('/api/expenses', ['category' => 'fuel', 'amount' => 5000, 'payment_method' => 'momo'])->json('data.id');

        $this->putJson("/api/expenses/{$id}", ['amount' => 4500])->assertOk()->assertJsonPath('data.amount', 4500);
        $this->deleteJson("/api/expenses/{$id}")->assertOk();

        expect(Expense::withTrashed()->find($id)->trashed())->toBeTrue();
    });
});

describe('audit log', function () {
    it('shows the owner who did what, newest first', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Entered twice'])->assertOk();

        $this->getJson("/api/audit-logs?table_name=sales&record_id={$saleId}")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.action', 'voided')
            ->assertJsonPath('data.0.user.name', $bay->owner->name)
            ->assertJsonPath('data.1.action', 'created')
            ->assertJsonPath('data.1.user.name', $bay->cashier->name);
    });

    it('only shows the owner their own bay', function () {
        $bay = bay();
        $other = bay();
        recordSale($other, $other->cashier)->assertCreated();

        Sanctum::actingAs($bay->owner);

        $ids = collect($this->getJson('/api/audit-logs')->json('data'))->pluck('branch_id')->unique()->all();

        expect($ids)->toBe([$bay->branch->id]);
    });
});
