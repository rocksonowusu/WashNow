<?php

use App\Models\AuditLog;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;

it('blocks a cashier from every owner-only route', function (string $method, string $path) {
    $bay = bay();
    Sanctum::actingAs($bay->cashier);

    $path = str_replace(
        ['{category}', '{washer}', '{user}'],
        [$bay->sedan->id, $bay->kofi->id, $bay->cashier->id],
        $path,
    );

    $this->json($method, $path, [])->assertForbidden();
})->with([
    ['POST', '/api/categories'],
    ['PUT', '/api/categories/{category}'],
    ['DELETE', '/api/categories/{category}'],
    ['PUT', '/api/branch'],
    ['PUT', '/api/washers/{washer}'],
    ['DELETE', '/api/washers/{washer}'],
    ['DELETE', '/api/customers/{user}'],
    ['PUT', '/api/expenses/{user}'],
    ['DELETE', '/api/expenses/{user}'],
    ['GET', '/api/users'],
    ['POST', '/api/users'],
    ['PUT', '/api/users/{user}'],
    ['GET', '/api/audit-logs'],
]);

it('lets a cashier read the categories and washers needed to record a sale', function () {
    $bay = bay();
    Sanctum::actingAs($bay->cashier);

    $this->getJson('/api/categories')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Sedan');
    $this->getJson('/api/washers')->assertOk()->assertJsonCount(2, 'data');
});

it('refuses everything without a token', function () {
    $this->getJson('/api/categories')->assertUnauthorized();
    $this->postJson('/api/sales', [])->assertUnauthorized();
});

describe('categories', function () {
    it('lets the owner add, change and remove a category', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $id = $this->postJson('/api/categories', [
            'name' => 'SUV', 'min_price' => 2000, 'max_price' => 15000, 'pricing_note' => 'Parts washed', 'sort_order' => 2,
        ])->assertCreated()->assertJsonPath('data.version', 1)->json('data.id');

        $this->putJson("/api/categories/{$id}", ['max_price' => 18000])
            ->assertOk()
            ->assertJsonPath('data.max_price', 18000)
            ->assertJsonPath('data.min_price', 2000)
            ->assertJsonPath('data.version', 2);

        $this->deleteJson("/api/categories/{$id}")->assertOk();

        expect(VehicleCategory::query()->find($id))->toBeNull()
            ->and(VehicleCategory::withTrashed()->find($id))->not->toBeNull();
    });

    it('rejects a highest price below the lowest, even when only one is sent', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->postJson('/api/categories', ['name' => 'Bus', 'min_price' => 20000, 'max_price' => 4000])
            ->assertUnprocessable()->assertJsonValidationErrors('max_price');

        // Sedan's lowest price is 1500.
        $this->putJson("/api/categories/{$bay->sedan->id}", ['max_price' => 1000])
            ->assertUnprocessable()->assertJsonValidationErrors('max_price');
    });

    it('rejects a second category with the same name', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->postJson('/api/categories', ['name' => 'Sedan', 'min_price' => 1, 'max_price' => 2])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
    });

    it('only shows and changes categories in the owner\'s own bay', function () {
        $bay = bay();
        $elsewhere = VehicleCategory::factory()->create();
        Sanctum::actingAs($bay->owner);

        $this->getJson('/api/categories')->assertJsonCount(1, 'data');
        $this->putJson("/api/categories/{$elsewhere->id}", ['name' => 'Mine now'])->assertNotFound();
    });
});

describe('washers', function () {
    it('lets the owner add, change and remove a washer', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $id = $this->postJson('/api/washers', ['name' => 'Yaw', 'commission_percent' => 25.5])
            ->assertCreated()->assertJsonPath('data.commission_percent', '25.50')->json('data.id');

        $this->putJson("/api/washers/{$id}", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->deleteJson("/api/washers/{$id}")->assertOk();

        expect(Washer::withTrashed()->find($id)->trashed())->toBeTrue();
    });

    it('keeps commission between 0 and 100', function (mixed $percent) {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->postJson('/api/washers', ['name' => 'Yaw', 'commission_percent' => $percent])
            ->assertUnprocessable()->assertJsonValidationErrors('commission_percent');
    })->with([-1, 100.01, 'half']);

    it('keeps a history of commission changes in the audit log', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->putJson("/api/washers/{$bay->kofi->id}", ['commission_percent' => 35])->assertOk();

        $log = AuditLog::query()->where('record_id', $bay->kofi->id)->where('action', 'updated')->sole();

        expect($log->user_id)->toBe($bay->owner->id)
            ->and((float) $log->before['commission_percent'])->toBe(30.0)
            ->and((float) $log->after['commission_percent'])->toBe(35.0);
    });
});

describe('users', function () {
    it('lets the owner add a cashier who can then sign in', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->postJson('/api/users', ['name' => 'Esi', 'phone' => '024 555 0001', 'pin' => '4821', 'role' => 'cashier'])
            ->assertCreated()
            ->assertJsonPath('data.phone', '0245550001')
            ->assertJsonPath('data.role', 'cashier')
            ->assertJsonMissingPath('data.pin_hash');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['phone' => '0245550001', 'pin' => '4821'])->assertOk();
    });

    it('signs a user out everywhere when they are turned off or their PIN changes', function (array $change) {
        $bay = bay();
        $bay->cashier->createToken('phone');
        $bay->cashier->createToken('laptop');
        Sanctum::actingAs($bay->owner);

        $this->putJson("/api/users/{$bay->cashier->id}", $change)->assertOk();

        expect($bay->cashier->tokens()->count())->toBe(0);
    })->with([
        'turned off' => [['active' => false]],
        'new PIN' => [['pin' => '9090']],
    ]);

    it('stores a changed PIN as a hash and never writes it to the audit log', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->putJson("/api/users/{$bay->cashier->id}", ['pin' => '9090'])->assertOk();

        $cashier = User::query()->find($bay->cashier->id);
        $log = AuditLog::query()->where('record_id', $cashier->id)->where('action', 'updated')->sole();

        expect(Hash::check('9090', $cashier->pin_hash))->toBeTrue()
            ->and($log->after)->toBe(['pin_hash' => '[hidden]'])
            ->and($log->before)->toBe(['pin_hash' => '[hidden]']);
    });

    it('stops the owner turning off or demoting their own account', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->putJson("/api/users/{$bay->owner->id}", ['active' => false])
            ->assertUnprocessable()->assertJsonValidationErrors('active');
        $this->putJson("/api/users/{$bay->owner->id}", ['role' => 'cashier'])
            ->assertUnprocessable()->assertJsonValidationErrors('role');
    });

    it('rejects a phone number another user already has', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->postJson('/api/users', ['name' => 'Esi', 'phone' => $bay->cashier->phone, 'pin' => '4821', 'role' => 'cashier'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
    });
});
