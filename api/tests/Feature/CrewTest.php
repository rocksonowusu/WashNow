<?php

use App\Models\Sale;
use App\Models\Washer;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

/** The owner sets the rate new crew start on. */
function setStandardCommission(stdClass $bay, int|float|null $percent): void
{
    Sanctum::actingAs($bay->owner);
    test()->putJson('/api/branch', ['default_commission_percent' => $percent])->assertOk();
}

describe('the standard commission', function () {
    it('is set by the owner and sent to devices with the branch', function () {
        $bay = bay();

        setStandardCommission($bay, 30);

        $this->getJson('/api/branch')->assertJsonPath('data.default_commission_percent', '30.00');
        $this->getJson('/api/sync/pull')->assertJsonPath('tables.branches.0.default_commission_percent', '30.00');
    });

    it('cannot be changed by a cashier, and must be a percentage', function () {
        $bay = bay();

        Sanctum::actingAs($bay->cashier);
        $this->putJson('/api/branch', ['default_commission_percent' => 90])->assertForbidden();

        Sanctum::actingAs($bay->owner);
        $this->putJson('/api/branch', ['default_commission_percent' => 101])->assertUnprocessable();
    });
});

describe('adding crew', function () {
    it('lets a cashier add someone, who starts on the standard commission', function () {
        $bay = bay();
        setStandardCommission($bay, 30);

        Sanctum::actingAs($bay->cashier);
        $this->postJson('/api/washers', ['name' => '  yaw   Mensah ', 'commission_percent' => 95])
            ->assertCreated()
            ->assertJsonPath('data.name', 'yaw Mensah')
            ->assertJsonPath('data.commission_percent', '30.00') // the cashier's 95 is ignored
            ->assertJsonPath('data.active', true);
    });

    it('does not let a cashier add anyone until the owner has set the standard commission', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $this->postJson('/api/washers', ['name' => 'Yaw'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('commission_percent');

        expect(Washer::query()->where('name', 'Yaw')->exists())->toBeFalse();
    });

    it('lets the owner give a different rate, or fall back to the standard one', function () {
        $bay = bay();
        setStandardCommission($bay, 30);

        $this->postJson('/api/washers', ['name' => 'Yaw', 'commission_percent' => 45])
            ->assertCreated()->assertJsonPath('data.commission_percent', '45.00');
        $this->postJson('/api/washers', ['name' => 'Esi'])
            ->assertCreated()->assertJsonPath('data.commission_percent', '30.00');
    });

    it('refuses a name that is already on the list, whatever the capitals', function () {
        $bay = bay();
        setStandardCommission($bay, 30);

        $this->postJson('/api/washers', ['name' => 'KOFI'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->putJson("/api/washers/{$bay->ama->id}", ['name' => 'kofi'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
    });

    it('still leaves pay and removal to the owner', function () {
        $bay = bay();
        Sanctum::actingAs($bay->cashier);

        $this->putJson("/api/washers/{$bay->kofi->id}", ['commission_percent' => 90])->assertForbidden();
        $this->deleteJson("/api/washers/{$bay->kofi->id}")->assertForbidden();
    });
});

describe('crew added on a device while offline', function () {
    it('accepts a new person and the sale they washed in one batch', function () {
        $bay = bay();
        setStandardCommission($bay, 30);

        $yawId = (string) Str::uuid7();
        $sale = saleRecord($bay, ['amount' => 5000, 'washer_ids' => [$yawId]]);

        syncPush(
            $bay->cashier,
            ['upsert', 'washers', ['id' => $yawId, 'name' => 'Yaw', 'commission_percent' => '80.00', 'active' => true, 'version' => 1]],
            ['upsert', 'sales', $sale],
        )->assertOk()->assertExactJson(['accepted' => [$yawId, $sale['id']], 'rejected' => []]);

        expect(Washer::query()->find($yawId)->commission_percent)->toBe('30.00')
            ->and(Sale::query()->find($sale['id'])->saleWashers()->sole()->commission_amount)->toBe(1500);
    });

    it('is harmless for a cashier to push the same new person twice', function () {
        $bay = bay();
        setStandardCommission($bay, 30);
        $record = ['id' => (string) Str::uuid7(), 'name' => 'Yaw', 'commission_percent' => '30.00', 'active' => true, 'version' => 1];

        syncPush($bay->cashier, ['upsert', 'washers', $record])->assertJsonPath('accepted', [$record['id']]);
        syncPush($bay->cashier, ['upsert', 'washers', $record])
            ->assertExactJson(['accepted' => [$record['id']], 'rejected' => []]);

        expect(Washer::query()->where('name', 'Yaw')->count())->toBe(1);
    });

    it('uses the existing person when two devices added the same name, and keeps the sale', function () {
        $bay = bay();
        setStandardCommission($bay, 30);

        // This device added "kofi" offline, not knowing Kofi was already on the list.
        $localId = (string) Str::uuid7();
        $sale = saleRecord($bay, ['amount' => 5000, 'washer_ids' => [$localId]]);

        $response = syncPush(
            $bay->cashier,
            ['upsert', 'washers', ['id' => $localId, 'name' => 'kofi', 'version' => 1]],
            ['upsert', 'sales', $sale],
        )->assertOk();

        $response->assertJsonPath('accepted', [$sale['id']])
            ->assertJsonPath('rejected.0.id', $localId)
            ->assertJsonPath('rejected.0.reason', 'duplicate_name')
            ->assertJsonPath('rejected.0.server_record.id', $bay->kofi->id);

        expect(Washer::query()->find($localId))->toBeNull()
            ->and(Sale::query()->find($sale['id'])->saleWashers()->sole()->washer_id)->toBe($bay->kofi->id);
    });

    it('does not let a cashier change an existing crew member through sync', function () {
        $bay = bay();

        syncPush($bay->cashier, ['upsert', 'washers', ['id' => $bay->kofi->id, 'name' => 'Someone Else', 'version' => 2]])
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        expect($bay->kofi->fresh()->name)->toBe('Kofi');
    });
});
