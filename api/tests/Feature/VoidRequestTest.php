<?php

use App\Models\AuditLog;
use App\Models\Sale;
use Laravel\Sanctum\Sanctum;

describe('asking for a void', function () {
    it('lets a cashier ask, without changing the sale or the totals', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier, ['amount' => 5000])->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Entered twice'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.void_request_reason', 'Entered twice')
            ->assertJsonPath('data.void_requested_by', $bay->cashier->id)
            ->assertJsonPath('data.version', 2);

        $this->getJson('/api/sales')->assertJsonPath('totals.total', 5000)->assertJsonPath('totals.count', 1);
    });

    it('needs a reason', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void-request", [])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
    });

    it('keeps the first request when asked again', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');

        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Entered twice'])->assertOk();
        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Changed my mind'])
            ->assertOk()->assertJsonPath('data.void_request_reason', 'Entered twice');
    });

    it('cannot be asked for a voided sale or a closed day', function () {
        $this->travelTo('2026-11-10 14:00:00');
        $bay = bay();
        $voidedId = recordSale($bay, $bay->cashier)->json('data.id');
        $lockedId = recordSale($bay, $bay->cashier)->json('data.id');

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$voidedId}/void", ['reason' => 'Mistake'])->assertOk();
        $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertCreated();

        Sanctum::actingAs($bay->cashier);
        $this->postJson("/api/sales/{$voidedId}/void-request", ['reason' => 'Too late'])->assertUnprocessable();
        $this->postJson("/api/sales/{$lockedId}/void-request", ['reason' => 'Too late'])->assertUnprocessable();
    });
});

describe('the owner answering', function () {
    it('approves by voiding, and the request stays on record', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');
        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Entered twice'])->assertOk();

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Entered twice'])
            ->assertOk()
            ->assertJsonPath('data.status', 'voided')
            ->assertJsonPath('data.void_requested_by', $bay->cashier->id);

        expect(Sale::query()->find($saleId)->hasVoidRequest())->toBeFalse();
    });

    it('declines by clearing the request and leaving the sale alone', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier, ['amount' => 5000])->json('data.id');
        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Entered twice'])->assertOk();

        Sanctum::actingAs($bay->owner);
        $this->deleteJson("/api/sales/{$saleId}/void-request")
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.void_request_reason', null)
            ->assertJsonPath('data.void_requested_by', null);

        // Both the asking and the answer are in the history.
        $actions = AuditLog::query()->where('record_id', $saleId)->orderBy('created_at')->orderBy('id')->pluck('action')->all();
        expect($actions)->toBe(['created', 'updated', 'updated']);
    });

    it('is not something a cashier can do', function () {
        $bay = bay();
        $saleId = recordSale($bay, $bay->cashier)->json('data.id');
        $this->postJson("/api/sales/{$saleId}/void-request", ['reason' => 'Entered twice'])->assertOk();

        $this->deleteJson("/api/sales/{$saleId}/void-request")->assertForbidden();
        $this->postJson("/api/sales/{$saleId}/void", ['reason' => 'Self service'])->assertForbidden();
    });
});

describe('void requests made offline', function () {
    it('accepts a cashier request through sync and sends it to other devices', function () {
        $bay = bay();
        $record = saleRecord($bay);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        syncPush($bay->cashier, ['upsert', 'sales', ['id' => $record['id'], 'void_request_reason' => 'Wrong car', 'version' => 2]])
            ->assertExactJson(['accepted' => [$record['id']], 'rejected' => []]);

        $sale = Sale::query()->find($record['id']);
        expect($sale->hasVoidRequest())->toBeTrue()
            ->and($sale->void_requested_by)->toBe($bay->cashier->id)
            ->and($sale->version)->toBe(2);

        Sanctum::actingAs($bay->owner);
        $this->getJson('/api/sync/pull')
            ->assertJsonPath('tables.sales.0.void_request_reason', 'Wrong car')
            ->assertJsonPath('tables.sales.0.status', 'active');
    });

    it('is harmless to push the same request twice', function () {
        $bay = bay();
        $record = saleRecord($bay);
        $request = ['id' => $record['id'], 'void_request_reason' => 'Wrong car', 'version' => 2];
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        syncPush($bay->cashier, ['upsert', 'sales', $request])->assertJsonPath('accepted', [$record['id']]);
        syncPush($bay->cashier, ['upsert', 'sales', $request])->assertJsonPath('accepted', [$record['id']]);

        expect(Sale::query()->find($record['id'])->version)->toBe(2);
    });

    it('lets the owner decline or approve through sync, but not a cashier', function () {
        $bay = bay();
        $first = saleRecord($bay);
        $second = saleRecord($bay);
        syncPush(
            $bay->cashier,
            ['upsert', 'sales', $first],
            ['upsert', 'sales', $second],
            ['upsert', 'sales', ['id' => $first['id'], 'void_request_reason' => 'Wrong car', 'version' => 2]],
            ['upsert', 'sales', ['id' => $second['id'], 'void_request_reason' => 'Entered twice', 'version' => 2]],
        )->assertJsonCount(4, 'accepted');

        syncPush($bay->cashier, ['upsert', 'sales', ['id' => $first['id'], 'void_request_declined' => true, 'version' => 3]])
            ->assertJsonPath('rejected.0.reason', 'forbidden');

        syncPush(
            $bay->owner,
            ['upsert', 'sales', ['id' => $first['id'], 'void_request_declined' => true, 'version' => 3]],
            ['upsert', 'sales', ['id' => $second['id'], 'status' => 'voided', 'void_reason' => 'Entered twice', 'version' => 3]],
        )->assertExactJson(['accepted' => [$first['id'], $second['id']], 'rejected' => []]);

        expect(Sale::query()->find($first['id'])->hasVoidRequest())->toBeFalse()
            ->and(Sale::query()->find($first['id'])->isVoided())->toBeFalse()
            ->and(Sale::query()->find($second['id'])->isVoided())->toBeTrue();
    });

    it('ignores a late request for a sale the owner already voided', function () {
        $bay = bay();
        $record = saleRecord($bay);
        syncPush($bay->cashier, ['upsert', 'sales', $record]);

        Sanctum::actingAs($bay->owner);
        $this->postJson("/api/sales/{$record['id']}/void", ['reason' => 'Mistake'])->assertOk();

        syncPush($bay->cashier, ['upsert', 'sales', ['id' => $record['id'], 'void_request_reason' => 'Wrong car', 'version' => 2]])
            ->assertJsonPath('accepted', [$record['id']]);

        expect(Sale::query()->find($record['id'])->void_request_reason)->toBeNull();
    });
});
