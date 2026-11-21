<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;

/*
| Make someone the WashNow admin (they can then create and manage every
| washing bay on the Admin page), or take it away again:
|
|   php artisan washnow:admin 0241234567
|   php artisan washnow:admin 0241234567 --remove
|
| They see the Admin page after they next open the app online.
*/
Artisan::command('washnow:admin {phone} {--remove}', function (string $phone) {
    $user = User::query()->where('phone', User::normalisePhone($phone))->first();

    if (! $user) {
        $this->error('Nobody signs in with that phone number.');

        return 1;
    }

    $user->forceFill(['is_admin' => ! $this->option('remove')])->save();

    $this->info($user->is_admin
        ? "{$user->name} is now the WashNow admin."
        : "{$user->name} is no longer the WashNow admin.");

    return 0;
})->purpose('Give or remove WashNow admin rights (manage every washing bay)');
