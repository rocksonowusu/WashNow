<?php

use App\Models\Branch;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/*
| Feature tests boot the Laravel application on a fresh in-memory database.
| Unit tests stay plain PHP.
*/

pest()->extend(TestCase::class)->use(RefreshDatabase::class)->in('Feature');

/**
 * A small washing bay to test against: an owner, a cashier, the Sedan
 * category (GH₵15 to GH₵100) and two washers, Kofi on 30% and Ama on 40%.
 */
function bay(): stdClass
{
    $branch = Branch::factory()->create();

    return (object) [
        'branch' => $branch,
        'owner' => User::factory()->owner()->for($branch)->create(),
        'cashier' => User::factory()->cashier()->for($branch)->create(),
        'sedan' => VehicleCategory::factory()->for($branch)->create([
            'name' => 'Sedan', 'min_price' => 1500, 'max_price' => 10000,
        ]),
        'kofi' => Washer::factory()->for($branch)->create(['name' => 'Kofi', 'commission_percent' => 30]),
        'ama' => Washer::factory()->for($branch)->create(['name' => 'Ama', 'commission_percent' => 40]),
    ];
}

/**
 * Record a sale through the API as the given user. Amounts are pesewas.
 *
 * @param  array<string, mixed>  $overrides
 */
function recordSale(stdClass $bay, User $as, array $overrides = []): TestResponse
{
    Sanctum::actingAs($as);

    return test()->postJson('/api/sales', $overrides + [
        'category_id' => $bay->sedan->id,
        'amount' => 5000,
        'payment_method' => 'cash',
        'washer_ids' => [$bay->kofi->id],
    ]);
}
