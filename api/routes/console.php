<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;

/*
| The WashNow admin manages every washing bay and belongs to none.
|
| Make an existing person the admin (they leave their bay; the bay and its
| records stay, and can be given a new owner on the admin page):
|
|   php artisan washnow:admin 0241234567
|
| Or create a new admin account:
|
|   php artisan washnow:admin 0241234567 --name="Kwame Asante" --pin=4821
*/
Artisan::command('washnow:admin {phone} {--name=} {--pin=}', function (string $phone) {
    $phone = User::normalisePhone($phone);
    $user = User::query()->where('phone', $phone)->first();

    if (! $user) {
        $name = trim((string) $this->option('name'));
        $pin = (string) $this->option('pin');

        if ($name === '' || ! preg_match('/^\d{4}$/', $pin)) {
            $this->error('Nobody signs in with that phone number. To create a new admin, add --name="Their name" --pin=1234 (4 digits).');

            return 1;
        }

        $user = User::query()->create([
            'branch_id' => null,
            'name' => $name,
            'phone' => $phone,
            'pin_hash' => $pin,
            'role' => UserRole::Admin,
            'active' => true,
        ]);

        $this->info("{$user->name} is the WashNow admin and can sign in now.");

        return 0;
    }

    if ($user->role === UserRole::Admin) {
        $this->info("{$user->name} is already the WashNow admin.");

        return 0;
    }

    $user->update(['role' => UserRole::Admin, 'branch_id' => null, 'active' => true]);
    // Their sign-ins were for a bay; they sign in again as the admin.
    $user->tokens()->delete();

    $this->info("{$user->name} is now the WashNow admin and no longer part of a washing bay.");

    return 0;
})->purpose('Make someone the WashNow admin, or create an admin account');
