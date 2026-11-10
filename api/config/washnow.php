<?php

return [

    /*
    | Values the database seeder uses to create the first branch and its owner.
    | Set them in .env before seeding a real server, then change the PIN.
    */

    'seed' => [
        'branch_name' => env('SEED_BRANCH_NAME', 'WashNow Main Bay'),
        'owner_name' => env('SEED_OWNER_NAME', 'Owner'),
        'owner_phone' => env('SEED_OWNER_PHONE'),
        'owner_pin' => env('SEED_OWNER_PIN'),
    ],

];
