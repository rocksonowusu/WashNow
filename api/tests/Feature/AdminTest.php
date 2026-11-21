<?php

use App\Models\Branch;
use App\Models\Sale;
use App\Models\VehicleCategory;
use Database\Factories\UserFactory;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

/** A bay whose owner is also the WashNow admin. */
function adminBay(): stdClass
{
    $bay = bay();
    $bay->owner->forceFill(['is_admin' => true])->save();

    return $bay;
}

function newBayPayload(array $overrides = []): array
{
    return $overrides + [
        'name' => 'Adenta Wash Bay',
        'location' => 'Adenta, Accra',
        'owner_name' => 'Efua Mensah',
        'owner_phone' => '+233 24 555 0101',
        'owner_pin' => '4821',
    ];
}

it('keeps the admin pages from everyone but the admin', function () {
    $bay = bay();

    Sanctum::actingAs($bay->owner);
    $this->getJson('/api/admin/branches')->assertForbidden();

    Sanctum::actingAs($bay->cashier);
    $this->postJson('/api/admin/branches', newBayPayload())->assertForbidden();

    expect(Branch::query()->count())->toBe(1);
});

it('creates a bay with its owner and the usual vehicle types', function () {
    $admin = adminBay();
    Sanctum::actingAs($admin->owner);

    $response = $this->postJson('/api/admin/branches', newBayPayload())->assertCreated();

    $response->assertJsonPath('data.name', 'Adenta Wash Bay')
        ->assertJsonPath('data.owners.0.name', 'Efua Mensah')
        ->assertJsonPath('data.owners.0.phone', '0245550101')
        ->assertJsonPath('data.is_own', false)
        ->assertJsonPath('data.suspended_at', null);

    $branchId = $response->json('data.id');
    expect(VehicleCategory::query()->where('branch_id', $branchId)->count())->toBe(6);

    // The new owner can sign in straight away, with either form of the number.
    $this->postJson('/api/auth/login', ['phone' => '0245550101', 'pin' => '4821'])
        ->assertOk()
        ->assertJsonPath('user.branch_id', $branchId)
        ->assertJsonPath('user.role', 'owner')
        ->assertJsonPath('user.is_admin', false);
});

it('refuses a phone number that already signs in somewhere', function () {
    $admin = adminBay();
    Sanctum::actingAs($admin->owner);

    $this->postJson('/api/admin/branches', newBayPayload(['owner_phone' => $admin->cashier->phone]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('owner_phone');

    $this->postJson('/api/admin/branches', newBayPayload(['name' => $admin->branch->name]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});

it('lists every bay with its owner and this month’s takings', function () {
    $admin = adminBay();
    $other = bay();

    recordSale($other, $other->cashier, ['amount' => 5000])->assertCreated();
    recordSale($other, $other->cashier, ['amount' => 3000])->assertCreated();
    $voided = recordSale($other, $other->cashier, ['amount' => 9000])->assertCreated();
    Sale::query()->whereKey($voided->json('data.id'))->update(['status' => 'voided']);

    // Last month's sale is left out of this month's figures.
    $old = recordSale($other, $other->cashier, ['amount' => 7000])->assertCreated();
    Sale::query()->whereKey($old->json('data.id'))->update(['sold_at' => now()->startOfMonth()->subDay()]);

    Sanctum::actingAs($admin->owner);
    $bays = collect($this->getJson('/api/admin/branches')->assertOk()->json('data'))->keyBy('id');

    expect($bays)->toHaveCount(2)
        ->and($bays[$admin->branch->id]['is_own'])->toBeTrue()
        ->and($bays[$other->branch->id]['month'])->toBe(['sales_count' => 2, 'sales_total' => 8000])
        ->and($bays[$other->branch->id]['owners'][0]['name'])->toBe($other->owner->name)
        ->and($bays[$other->branch->id]['staff_count'])->toBe(2)
        ->and($bays[$other->branch->id]['last_sale_at'])->not->toBeNull();
});

it('suspends a bay: everyone is signed out and nobody can sign in', function () {
    $admin = adminBay();
    $other = bay();
    $other->owner->createToken('phone');
    $other->cashier->createToken('phone');

    Sanctum::actingAs($admin->owner);
    $this->postJson("/api/admin/branches/{$other->branch->id}/suspend")
        ->assertOk()
        ->assertJsonPath('data.suspended_at', fn ($value) => $value !== null);

    expect(PersonalAccessToken::query()->where('tokenable_id', $other->owner->id)->count())->toBe(0)
        ->and(PersonalAccessToken::query()->where('tokenable_id', $other->cashier->id)->count())->toBe(0);

    $this->postJson('/api/auth/login', ['phone' => $other->owner->phone, 'pin' => UserFactory::DEFAULT_PIN])
        ->assertForbidden()
        ->assertJsonPath('errors.phone.0', 'This washing bay has been suspended. Contact WashNow to turn it back on.');

    // A token made before the suspension reached it is refused too.
    Sanctum::actingAs($other->cashier);
    $this->getJson('/api/categories')->assertForbidden();

    // Turned back on: they can sign in again.
    Sanctum::actingAs($admin->owner);
    $this->deleteJson("/api/admin/branches/{$other->branch->id}/suspend")->assertOk()->assertJsonPath('data.suspended_at', null);
    $this->postJson('/api/auth/login', ['phone' => $other->owner->phone, 'pin' => UserFactory::DEFAULT_PIN])->assertOk();
});

it('will not let the admin suspend their own bay', function () {
    $admin = adminBay();
    Sanctum::actingAs($admin->owner);

    $this->postJson("/api/admin/branches/{$admin->branch->id}/suspend")->assertUnprocessable();

    expect($admin->branch->fresh()->suspended_at)->toBeNull();
});

it('renames a bay', function () {
    $admin = adminBay();
    $other = bay();
    Sanctum::actingAs($admin->owner);

    $this->putJson("/api/admin/branches/{$other->branch->id}", ['name' => 'Spintex Bay', 'location' => 'Spintex Road'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Spintex Bay')
        ->assertJsonPath('data.location', 'Spintex Road');
});

it('resets a forgotten PIN and signs the person out everywhere', function () {
    $admin = adminBay();
    $other = bay();
    $other->owner->createToken('old phone');
    Sanctum::actingAs($admin->owner);

    $people = $this->getJson("/api/admin/branches/{$other->branch->id}/users")->assertOk()->json('data');
    expect($people[0]['role'])->toBe('owner')->and($people)->toHaveCount(2);

    $this->putJson("/api/admin/branches/{$other->branch->id}/users/{$other->owner->id}/pin", ['pin' => '7302'])->assertOk();

    expect(PersonalAccessToken::query()->where('tokenable_id', $other->owner->id)->count())->toBe(0);

    $this->postJson('/api/auth/login', ['phone' => $other->owner->phone, 'pin' => '7302'])->assertOk();

    // The user must belong to the bay in the address.
    $this->putJson("/api/admin/branches/{$admin->branch->id}/users/{$other->owner->id}/pin", ['pin' => '1111'])->assertNotFound();
});

it('tells only the admin themselves that they are the admin', function () {
    $admin = adminBay();

    $this->postJson('/api/auth/login', ['phone' => $admin->owner->phone, 'pin' => UserFactory::DEFAULT_PIN])
        ->assertOk()
        ->assertJsonPath('user.is_admin', true);

    Sanctum::actingAs($admin->owner);
    $this->getJson('/api/auth/me')->assertJsonPath('user.is_admin', true);

    // The bay's devices sync the user list, but never the admin flag.
    Sanctum::actingAs($admin->cashier);
    $users = $this->getJson('/api/sync/pull')->assertOk()->json('tables.users');
    expect(collect($users)->every(fn (array $user) => ! array_key_exists('is_admin', $user)))->toBeTrue();
});

it('makes someone the admin from the command line', function () {
    $bay = bay();

    $this->artisan('washnow:admin', ['phone' => $bay->owner->phone])->assertSuccessful();
    expect($bay->owner->fresh()->is_admin)->toBeTrue();

    $this->artisan('washnow:admin', ['phone' => $bay->owner->phone, '--remove' => true])->assertSuccessful();
    expect($bay->owner->fresh()->is_admin)->toBeFalse();

    $this->artisan('washnow:admin', ['phone' => '0209999999'])->assertFailed();
});
