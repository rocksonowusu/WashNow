<?php

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Sale;
use App\Models\User;
use App\Models\VehicleCategory;
use Database\Factories\UserFactory;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

/** The WashNow admin: belongs to no bay. */
function admin(): User
{
    return User::factory()->admin()->create();
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

it('keeps the admin pages from everyone in a bay', function () {
    $bay = bay();

    Sanctum::actingAs($bay->owner);
    $this->getJson('/api/admin/branches')->assertForbidden();

    Sanctum::actingAs($bay->cashier);
    $this->postJson('/api/admin/branches', newBayPayload())->assertForbidden();

    expect(Branch::query()->count())->toBe(1);
});

it('keeps the admin out of every bay screen, sync included', function () {
    bay();
    Sanctum::actingAs(admin());

    $this->getJson('/api/categories')->assertForbidden();
    $this->getJson('/api/sync/pull')->assertForbidden();
    $this->postJson('/api/sync/push', ['changes' => []])->assertForbidden();
    $this->getJson('/api/reports/summary?from=2026-11-01&to=2026-11-02')->assertForbidden();
});

it('signs the admin in with no bay', function () {
    $admin = admin();

    $this->postJson('/api/auth/login', ['phone' => $admin->phone, 'pin' => UserFactory::DEFAULT_PIN])
        ->assertOk()
        ->assertJsonPath('user.role', 'admin')
        ->assertJsonPath('user.branch_id', null)
        ->assertJsonPath('user.branch', null);
});

it('creates a bay with its owner and the usual vehicle types', function () {
    Sanctum::actingAs(admin());

    $response = $this->postJson('/api/admin/branches', newBayPayload())->assertCreated();

    $response->assertJsonPath('data.name', 'Adenta Wash Bay')
        ->assertJsonPath('data.owners.0.name', 'Efua Mensah')
        ->assertJsonPath('data.owners.0.phone', '0245550101')
        ->assertJsonPath('data.suspended_at', null);

    $branchId = $response->json('data.id');
    expect(VehicleCategory::query()->where('branch_id', $branchId)->count())->toBe(6);

    // The new owner can sign in straight away, with either form of the number.
    $this->postJson('/api/auth/login', ['phone' => '0245550101', 'pin' => '4821'])
        ->assertOk()
        ->assertJsonPath('user.branch_id', $branchId)
        ->assertJsonPath('user.role', 'owner');
});

it('refuses a phone number or bay name that is already taken', function () {
    $bay = bay();
    Sanctum::actingAs(admin());

    $this->postJson('/api/admin/branches', newBayPayload(['owner_phone' => $bay->cashier->phone]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('owner_phone');

    $this->postJson('/api/admin/branches', newBayPayload(['name' => $bay->branch->name]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});

it('lists every bay with its owner and this month’s takings', function () {
    $first = bay();
    $other = bay();

    recordSale($other, $other->cashier, ['amount' => 5000])->assertCreated();
    recordSale($other, $other->cashier, ['amount' => 3000])->assertCreated();
    $voided = recordSale($other, $other->cashier, ['amount' => 9000])->assertCreated();
    Sale::query()->whereKey($voided->json('data.id'))->update(['status' => 'voided']);

    // Last month's sale is left out of this month's figures.
    $old = recordSale($other, $other->cashier, ['amount' => 7000])->assertCreated();
    Sale::query()->whereKey($old->json('data.id'))->update(['sold_at' => now()->startOfMonth()->subDay()]);

    Sanctum::actingAs(admin());
    $bays = collect($this->getJson('/api/admin/branches')->assertOk()->json('data'))->keyBy('id');

    expect($bays)->toHaveCount(2)
        ->and($bays[$first->branch->id]['month'])->toBe(['sales_count' => 0, 'sales_total' => 0])
        ->and($bays[$other->branch->id]['month'])->toBe(['sales_count' => 2, 'sales_total' => 8000])
        ->and($bays[$other->branch->id]['owners'][0]['name'])->toBe($other->owner->name)
        ->and($bays[$other->branch->id]['staff_count'])->toBe(2)
        ->and($bays[$other->branch->id]['last_sale_at'])->not->toBeNull();

    $this->getJson("/api/admin/branches/{$other->branch->id}")
        ->assertOk()
        ->assertJsonPath('data.month.sales_total', 8000);
});

it('shows the admin any bay’s full report and its files', function () {
    $bay = bay();
    recordSale($bay, $bay->cashier, ['amount' => 5000])->assertCreated();
    $today = now()->toDateString();

    Sanctum::actingAs(admin());

    $this->getJson("/api/admin/branches/{$bay->branch->id}/reports/summary?from={$today}&to={$today}")
        ->assertOk()
        ->assertJsonPath('data.totals.sales', 5000)
        ->assertJsonPath('data.totals.vehicles', 1);

    $this->get("/api/admin/branches/{$bay->branch->id}/reports/export?from={$today}&to={$today}&format=xlsx")
        ->assertOk()
        ->assertDownload();
});

it('suspends a bay: everyone is signed out and nobody can sign in', function () {
    $other = bay();
    $other->owner->createToken('phone');
    $other->cashier->createToken('phone');
    $admin = admin();

    Sanctum::actingAs($admin);
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
    Sanctum::actingAs($admin);
    $this->deleteJson("/api/admin/branches/{$other->branch->id}/suspend")->assertOk()->assertJsonPath('data.suspended_at', null);
    $this->postJson('/api/auth/login', ['phone' => $other->owner->phone, 'pin' => UserFactory::DEFAULT_PIN])->assertOk();
});

it('renames a bay', function () {
    $other = bay();
    Sanctum::actingAs(admin());

    $this->putJson("/api/admin/branches/{$other->branch->id}", ['name' => 'Spintex Bay', 'location' => 'Spintex Road'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Spintex Bay')
        ->assertJsonPath('data.location', 'Spintex Road');
});

it('gives a bay a new owner or cashier', function () {
    $bay = bay();
    Sanctum::actingAs(admin());

    $this->postJson("/api/admin/branches/{$bay->branch->id}/users", [
        'name' => 'Yaw Boateng', 'phone' => '0277000111', 'pin' => '5566', 'role' => 'owner',
    ])->assertCreated()->assertJsonPath('data.role', 'owner');

    // Nobody can be made an admin this way, and phones stay one per person.
    $this->postJson("/api/admin/branches/{$bay->branch->id}/users", [
        'name' => 'Sneaky', 'phone' => '0277000222', 'pin' => '5566', 'role' => 'admin',
    ])->assertUnprocessable()->assertJsonValidationErrors('role');

    $this->postJson("/api/admin/branches/{$bay->branch->id}/users", [
        'name' => 'Twin', 'phone' => $bay->cashier->phone, 'pin' => '5566', 'role' => 'cashier',
    ])->assertUnprocessable()->assertJsonValidationErrors('phone');

    $this->postJson('/api/auth/login', ['phone' => '0277000111', 'pin' => '5566'])
        ->assertOk()
        ->assertJsonPath('user.branch_id', $bay->branch->id);
});

it('turns a person off and on, signing them out when turned off', function () {
    $bay = bay();
    $bay->cashier->createToken('phone');
    Sanctum::actingAs(admin());

    $this->putJson("/api/admin/branches/{$bay->branch->id}/users/{$bay->cashier->id}", ['active' => false])
        ->assertOk()
        ->assertJsonPath('data.active', false);

    expect(PersonalAccessToken::query()->where('tokenable_id', $bay->cashier->id)->count())->toBe(0);

    $this->postJson('/api/auth/login', ['phone' => $bay->cashier->phone, 'pin' => UserFactory::DEFAULT_PIN])->assertUnprocessable();

    $this->putJson("/api/admin/branches/{$bay->branch->id}/users/{$bay->cashier->id}", ['active' => true])->assertOk();
    $this->postJson('/api/auth/login', ['phone' => $bay->cashier->phone, 'pin' => UserFactory::DEFAULT_PIN])->assertOk();
});

it('resets a forgotten PIN and signs the person out everywhere', function () {
    $bay = bay();
    $other = bay();
    $other->owner->createToken('old phone');
    Sanctum::actingAs(admin());

    $people = $this->getJson("/api/admin/branches/{$other->branch->id}/users")->assertOk()->json('data');
    expect($people[0]['role'])->toBe('owner')->and($people)->toHaveCount(2);

    $this->putJson("/api/admin/branches/{$other->branch->id}/users/{$other->owner->id}/pin", ['pin' => '7302'])->assertOk();

    expect(PersonalAccessToken::query()->where('tokenable_id', $other->owner->id)->count())->toBe(0);

    $this->postJson('/api/auth/login', ['phone' => $other->owner->phone, 'pin' => '7302'])->assertOk();

    // The person must belong to the bay in the address.
    $this->putJson("/api/admin/branches/{$bay->branch->id}/users/{$other->owner->id}/pin", ['pin' => '1111'])->assertNotFound();
});

it('never lets an owner make someone an admin', function () {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $this->postJson('/api/users', ['name' => 'Sneaky', 'phone' => '0277000333', 'pin' => '1234', 'role' => 'admin'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('role');

    $this->putJson("/api/users/{$bay->cashier->id}", ['role' => 'admin'])->assertUnprocessable();

    expect(User::query()->where('role', UserRole::Admin)->count())->toBe(0);
});

it('makes someone the admin from the command line', function () {
    $bay = bay();
    $bay->owner->createToken('phone');

    $this->artisan('washnow:admin', ['phone' => $bay->owner->phone])->assertSuccessful();

    $owner = $bay->owner->fresh();
    expect($owner->role)->toBe(UserRole::Admin)
        ->and($owner->branch_id)->toBeNull()
        ->and($owner->tokens()->count())->toBe(0);

    // A brand-new admin account.
    $this->artisan('washnow:admin', ['phone' => '0209999999', '--name' => 'Kwame Asante', '--pin' => '4821'])->assertSuccessful();
    $this->postJson('/api/auth/login', ['phone' => '0209999999', 'pin' => '4821'])->assertOk()->assertJsonPath('user.role', 'admin');

    // Unknown number without a name and PIN: nothing happens.
    $this->artisan('washnow:admin', ['phone' => '0208888888'])->assertFailed();
});
