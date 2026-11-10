<?php

use App\Models\User;
use Database\Factories\UserFactory;
use Laravel\Sanctum\PersonalAccessToken;

function login(string $phone, string $pin = UserFactory::DEFAULT_PIN)
{
    return test()->postJson('/api/auth/login', ['phone' => $phone, 'pin' => $pin]);
}

it('logs in with phone and PIN and returns a token', function () {
    $user = User::factory()->owner()->create(['phone' => '0244000001']);

    $response = login('0244000001');

    $response->assertOk()
        ->assertJsonStructure(['token', 'user' => ['id', 'name', 'phone', 'role', 'active', 'branch_id', 'branch' => ['id', 'name']]])
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('user.role', 'owner')
        ->assertJsonMissingPath('user.pin_hash');

    expect($response->json('token'))->toBeString()->not->toBeEmpty()
        ->and(PersonalAccessToken::query()->count())->toBe(1);
});

it('accepts a phone number typed with spaces or dashes', function () {
    User::factory()->create(['phone' => '0244000001']);

    login('024 400-0001')->assertOk();
});

it('rejects a wrong PIN', function () {
    User::factory()->create(['phone' => '0244000001']);

    login('0244000001', '9999')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('phone');

    expect(PersonalAccessToken::query()->count())->toBe(0);
});

it('rejects an unknown phone number with the same message as a wrong PIN', function () {
    User::factory()->create(['phone' => '0244000001']);

    $wrongPin = login('0244000001', '9999')->json('errors.phone.0');
    $unknown = login('0200000009')->json('errors.phone.0');

    expect($unknown)->toBe($wrongPin);
});

it('rejects a user who has been turned off', function () {
    User::factory()->inactive()->create(['phone' => '0244000001']);

    login('0244000001')->assertUnprocessable();
});

it('requires a 4-digit PIN', function (string $pin) {
    User::factory()->create(['phone' => '0244000001']);

    login('0244000001', $pin)->assertUnprocessable()->assertJsonValidationErrors('pin');
})->with(['123', '12345', 'abcd']);

it('locks the phone number after five wrong PINs', function () {
    User::factory()->create(['phone' => '0244000001']);

    foreach (range(1, 5) as $attempt) {
        login('0244000001', '9999')->assertUnprocessable();
    }

    // Even the right PIN is refused while locked.
    login('0244000001')->assertStatus(429);
});

it('returns the signed-in user from /me', function () {
    $user = User::factory()->create(['phone' => '0244000001']);
    $token = login('0244000001')->json('token');

    $this->withToken($token)->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('user.branch.id', $user->branch_id);
});

it('refuses /me without a token', function () {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('logs out by revoking only the current token', function () {
    User::factory()->create(['phone' => '0244000001']);
    $phoneToken = login('0244000001')->json('token');
    $laptopToken = login('0244000001')->json('token');

    $this->withToken($phoneToken)->postJson('/api/auth/logout')->assertOk();

    expect(PersonalAccessToken::query()->count())->toBe(1);

    // The guard remembers the user within one test, so reset it between requests.
    $this->app['auth']->forgetGuards();
    $this->withToken($phoneToken)->getJson('/api/auth/me')->assertUnauthorized();

    $this->app['auth']->forgetGuards();
    $this->withToken($laptopToken)->getJson('/api/auth/me')->assertOk();
});
