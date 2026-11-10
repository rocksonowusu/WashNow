<?php

use App\Models\User;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    Route::middleware(['api', 'auth:sanctum', 'role:owner'])
        ->get('/api/_test/owner-only', fn () => ['ok' => true]);

    Route::middleware(['api', 'auth:sanctum', 'role:owner,cashier'])
        ->get('/api/_test/staff', fn () => ['ok' => true]);
});

it('lets an owner into an owner-only route', function () {
    Sanctum::actingAs(User::factory()->owner()->create());

    $this->getJson('/api/_test/owner-only')->assertOk();
});

it('blocks a cashier from an owner-only route', function () {
    Sanctum::actingAs(User::factory()->cashier()->create());

    $this->getJson('/api/_test/owner-only')->assertForbidden();
});

it('lets both roles into a route that lists both', function (string $role) {
    Sanctum::actingAs(User::factory()->{$role}()->create());

    $this->getJson('/api/_test/staff')->assertOk();
})->with(['owner', 'cashier']);

it('blocks a user who has been turned off, even with a valid token', function () {
    Sanctum::actingAs(User::factory()->owner()->inactive()->create());

    $this->getJson('/api/_test/owner-only')->assertForbidden();
});

it('asks a visitor without a token to sign in', function () {
    $this->getJson('/api/_test/owner-only')->assertUnauthorized();
});
