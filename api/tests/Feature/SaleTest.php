<?php

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

it('lets a cashier record a sale inside the price range', function () {
    $bay = bay();

    $response = recordSale($bay, $bay->cashier, [
        'amount' => 5000,
        'payment_method' => 'momo',
        'plate_number' => 'gr 1234-21',
        'service_note' => 'body + engine',
    ]);

    $response->assertCreated()
        ->assertJsonPath('data.amount', 5000)
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.payment_method', 'momo')
        ->assertJsonPath('data.plate_number', 'GR123421')
        ->assertJsonPath('data.recorded_by', $bay->cashier->id)
        ->assertJsonPath('data.override_reason', null);

    expect(Sale::query()->count())->toBe(1);
});

it('keeps the id a device generated for the sale', function () {
    $bay = bay();
    $id = (string) Str::uuid7();

    recordSale($bay, $bay->cashier, ['id' => $id])->assertCreated()->assertJsonPath('data.id', $id);
});

it('rejects a price outside the range from a cashier', function (int $amount) {
    $bay = bay();

    recordSale($bay, $bay->cashier, ['amount' => $amount])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('amount');

    expect(Sale::query()->count())->toBe(0);
})->with([
    'below the minimum' => 1499,
    'above the maximum' => 10001,
]);

it('accepts prices exactly on the edges of the range', function (int $amount) {
    $bay = bay();

    recordSale($bay, $bay->cashier, ['amount' => $amount])->assertCreated();
})->with([1500, 10000]);

it('does not let a cashier approve an out-of-range price with a reason', function () {
    $bay = bay();

    recordSale($bay, $bay->cashier, ['amount' => 12000, 'override_reason' => 'Very dirty'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('amount');
});

it('makes the owner give a reason for an out-of-range price', function () {
    $bay = bay();

    recordSale($bay, $bay->owner, ['amount' => 12000])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('override_reason');

    recordSale($bay, $bay->owner, ['amount' => 12000, 'override_reason' => 'Full interior detail'])
        ->assertCreated()
        ->assertJsonPath('data.amount', 12000)
        ->assertJsonPath('data.override_reason', 'Full interior detail');
});

it('copies the washer commission onto the sale so later changes do not rewrite it', function () {
    $bay = bay();

    $saleId = recordSale($bay, $bay->cashier, ['amount' => 5000])->json('data.id');

    $row = SaleWasher::query()->where('sale_id', $saleId)->sole();
    expect($row->commission_percent)->toBe('30.00')
        ->and($row->commission_amount)->toBe(1500);

    // The owner raises Kofi to 50%.
    Sanctum::actingAs($bay->owner);
    $this->putJson("/api/washers/{$bay->kofi->id}", ['commission_percent' => 50])->assertOk();

    $row->refresh();
    expect($row->commission_percent)->toBe('30.00')
        ->and($row->commission_amount)->toBe(1500);

    // A new sale uses the new rate.
    $newSaleId = recordSale($bay, $bay->cashier, ['amount' => 5000])->json('data.id');
    expect(SaleWasher::query()->where('sale_id', $newSaleId)->sole()->commission_amount)->toBe(2500);
});

it('splits a sale equally between two washers, each on their own percentage', function () {
    $bay = bay();

    // GH₵100 shared by Kofi (30%) and Ama (40%): GH₵50 each,
    // so Kofi earns GH₵15 and Ama earns GH₵20.
    $response = recordSale($bay, $bay->cashier, [
        'amount' => 10000,
        'washer_ids' => [$bay->kofi->id, $bay->ama->id],
    ])->assertCreated();

    $rows = collect($response->json('data.sale_washers'))->keyBy('washer_id');

    expect($rows)->toHaveCount(2)
        ->and($rows[$bay->kofi->id]['commission_amount'])->toBe(1500)
        ->and($rows[$bay->kofi->id]['commission_percent'])->toBe('30.00')
        ->and($rows[$bay->ama->id]['commission_amount'])->toBe(2000)
        ->and($rows[$bay->ama->id]['commission_percent'])->toBe('40.00');
});

it('rounds an uneven split to whole pesewas', function () {
    $bay = bay();
    $bay->kofi->update(['commission_percent' => 33.33]);
    $bay->ama->update(['commission_percent' => 33.33]);

    // GH₵25.01 between two: shares of 1251 and 1250 pesewas.
    $response = recordSale($bay, $bay->cashier, [
        'amount' => 2501,
        'washer_ids' => [$bay->kofi->id, $bay->ama->id],
    ])->assertCreated();

    $rows = collect($response->json('data.sale_washers'))->keyBy('washer_id');

    expect($rows[$bay->kofi->id]['commission_amount'])->toBe(417) // 1251 x 33.33% = 416.96
        ->and($rows[$bay->ama->id]['commission_amount'])->toBe(417); // 1250 x 33.33% = 416.63
});

it('needs at least one washer', function () {
    $bay = bay();

    recordSale($bay, $bay->cashier, ['washer_ids' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('washer_ids');
});

it('rejects washers and categories that are turned off or belong to another bay', function () {
    $bay = bay();
    $inactive = Washer::factory()->for($bay->branch)->create(['active' => false]);
    $elsewhere = Washer::factory()->create();
    $otherCategory = VehicleCategory::factory()->create();

    recordSale($bay, $bay->cashier, ['washer_ids' => [$inactive->id]])
        ->assertUnprocessable()->assertJsonValidationErrors('washer_ids');

    recordSale($bay, $bay->cashier, ['washer_ids' => [$elsewhere->id]])
        ->assertUnprocessable()->assertJsonValidationErrors('washer_ids');

    recordSale($bay, $bay->cashier, ['category_id' => $otherCategory->id])
        ->assertUnprocessable()->assertJsonValidationErrors('category_id');
});

it('rejects a sale dated in the future', function () {
    $bay = bay();

    recordSale($bay, $bay->cashier, ['sold_at' => now()->addDay()->toIso8601String()])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('sold_at');
});

it('links a sale to the customer with that plate and keeps their totals up to date', function () {
    $bay = bay();
    $customer = Customer::factory()->for($bay->branch)->create(['plate_number' => 'GR123421']);

    recordSale($bay, $bay->cashier, ['amount' => 5000, 'plate_number' => 'GR-1234-21'])
        ->assertCreated()
        ->assertJsonPath('data.customer_id', $customer->id);

    recordSale($bay, $bay->cashier, ['amount' => 3000, 'customer_id' => $customer->id])
        ->assertCreated()
        ->assertJsonPath('data.plate_number', 'GR123421');

    $customer->refresh();
    expect($customer->visit_count)->toBe(2)
        ->and($customer->total_spent)->toBe(8000);
});

it('shows a cashier only today, and lets the owner pick a date', function () {
    $bay = bay();
    recordSale($bay, $bay->cashier, ['amount' => 5000, 'payment_method' => 'cash']);
    recordSale($bay, $bay->cashier, ['amount' => 3000, 'payment_method' => 'momo']);
    recordSale($bay, $bay->cashier, ['amount' => 2000, 'sold_at' => now()->subDay()->toIso8601String()]);

    $yesterday = now()->subDay()->toDateString();

    Sanctum::actingAs($bay->cashier);
    $this->getJson("/api/sales?date={$yesterday}")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('totals.count', 2)
        ->assertJsonPath('totals.total', 8000)
        ->assertJsonPath('totals.cash', 5000)
        ->assertJsonPath('totals.momo', 3000);

    Sanctum::actingAs($bay->owner);
    $this->getJson("/api/sales?date={$yesterday}")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('totals.total', 2000);
});

it('has no way to edit or delete a sale', function () {
    $bay = bay();
    $saleId = recordSale($bay, $bay->owner)->json('data.id');

    $this->deleteJson("/api/sales/{$saleId}")->assertStatus(405);
    $this->putJson("/api/sales/{$saleId}", ['amount' => 1])->assertStatus(405);

    expect(Sale::query()->find($saleId))->not->toBeNull();
});

describe('voiding', function () {
    it('does not let a cashier void a sale', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Wrong car'])->assertForbidden();

        expect(Sale::query()->find($saleId)->isVoided())->toBeFalse();
    });

    it('makes the owner give a reason', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->owner)->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
    });

    it('marks the sale voided, keeps it visible and takes it out of the totals', function () {
        $bay = bay();
        $customer = Customer::factory()->for($bay->branch)->create();
        $keptId = recordSale($bay, $bay->cashier, ['amount' => 3000, 'customer_id' => $customer->id])->json('data.id');
        $voidedId = recordSale($bay, $bay->cashier, ['amount' => 5000, 'customer_id' => $customer->id])->json('data.id');

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$voidedId}/void", ['reason' => 'Entered twice'])
            ->assertOk()
            ->assertJsonPath('data.status', 'voided')
            ->assertJsonPath('data.void_reason', 'Entered twice');

        // Still in the list, but not in the totals.
        $this->getJson('/api/sales')
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('totals.count', 1)
            ->assertJsonPath('totals.total', 3000);

        // The row and its commission record are kept, not deleted.
        expect(Sale::query()->find($voidedId))->not->toBeNull()
            ->and(SaleWasher::query()->where('sale_id', $voidedId)->count())->toBe(1)
            ->and(Sale::query()->find($keptId)->isVoided())->toBeFalse();

        $customer->refresh();
        expect($customer->visit_count)->toBe(1)
            ->and($customer->total_spent)->toBe(3000);
    });

    it('cannot void the same sale twice', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->owner)->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Entered twice'])->assertOk();
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Again'])->assertUnprocessable();
    });

    it('records who voided it in the audit log', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Entered twice'])->assertOk();

        $log = AuditLog::query()->where('record_id', $saleId)->where('action', 'voided')->sole();

        expect($log->user_id)->toBe($bay->owner->id)
            ->and($log->table_name)->toBe('sales')
            ->and($log->before)->toBe(['status' => 'active', 'void_reason' => null])
            ->and($log->after)->toBe(['status' => 'voided', 'void_reason' => 'Entered twice']);
    });

    it('cannot reach a sale from another bay', function () {
        $bay = bay();
        $other = bay();
        $saleId = recordSale($other, $other->cashier)->json('data.id');

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Not mine'])->assertNotFound();
        $this->getJson("/api/sales/{$saleId}")->assertNotFound();
    });
});
