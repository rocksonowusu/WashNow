<?php

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Models\VehicleCategory;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    config([
        'washnow.seed.branch_name' => 'Test Bay',
        'washnow.seed.owner_name' => 'Test Owner',
        'washnow.seed.owner_phone' => '0244 000 001',
        'washnow.seed.owner_pin' => '4821',
    ]);
});

it('seeds one branch, one owner and the six vehicle categories', function () {
    $this->seed();

    $branch = Branch::query()->sole();
    $owner = User::query()->sole();

    expect($branch->name)->toBe('Test Bay')
        ->and($owner->role)->toBe(UserRole::Owner)
        ->and($owner->branch_id)->toBe($branch->id)
        ->and($owner->phone)->toBe('0244000001')
        ->and(Hash::check('4821', $owner->pin_hash))->toBeTrue();

    $ranges = VehicleCategory::query()
        ->orderBy('sort_order')
        ->get()
        ->map(fn (VehicleCategory $category) => [$category->name, $category->min_price, $category->max_price])
        ->all();

    // Prices are in pesewas: GH₵15.00 is 1500.
    expect($ranges)->toBe([
        ['Sedan', 1500, 10000],
        ['SUV', 2000, 15000],
        ['Bus', 4000, 20000],
        ['Pickup truck', 4000, 20000],
        ['Tipper / container truck', 10000, 40000],
        ['Heavy-duty machine', 4000, 40000],
    ]);
});

it('can be run twice without duplicating anything', function () {
    $this->seed();
    $this->seed();

    expect(Branch::query()->count())->toBe(1)
        ->and(User::query()->count())->toBe(1)
        ->and(VehicleCategory::query()->count())->toBe(6);
});

it('lets the seeded owner log in', function () {
    $this->seed();

    $this->postJson('/api/auth/login', ['phone' => '0244000001', 'pin' => '4821'])
        ->assertOk()
        ->assertJsonPath('user.role', 'owner');
});

it('refuses to seed without an owner phone and 4-digit PIN', function () {
    config(['washnow.seed.owner_pin' => null]);

    $this->seed();
})->throws(RuntimeException::class);
