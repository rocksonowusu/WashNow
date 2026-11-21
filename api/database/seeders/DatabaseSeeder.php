<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Models\Washer;
use App\Services\BaySetup;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * The first bay and its owner. Further bays are created on the Admin page.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Safe to run more than once: existing rows are left as they are.
     */
    public function run(): void
    {
        $seed = config('washnow.seed');

        if (blank($seed['owner_phone']) || ! preg_match('/^\d{4}$/', (string) $seed['owner_pin'])) {
            throw new RuntimeException(
                'Set SEED_OWNER_PHONE and a 4-digit SEED_OWNER_PIN in api/.env before seeding.'
            );
        }

        $branch = Branch::query()->firstOrCreate(['name' => $seed['branch_name']]);

        User::query()->firstOrCreate(
            ['phone' => User::normalisePhone($seed['owner_phone'])],
            [
                'branch_id' => $branch->id,
                'name' => $seed['owner_name'],
                'pin_hash' => (string) $seed['owner_pin'],
                'role' => UserRole::Owner,
                'active' => true,
            ],
        );

        app(BaySetup::class)->addDefaultCategories($branch);

        // On a developer's machine only: two sample washers, so a sale can be
        // recorded before the owner's settings screens exist. Never seeded on
        // the real server.
        if (app()->environment('local')) {
            foreach (['Kofi (sample)', 'Ama (sample)'] as $name) {
                Washer::query()->firstOrCreate(
                    ['branch_id' => $branch->id, 'name' => $name],
                    ['commission_percent' => 30, 'active' => true],
                );
            }
        }
    }
}
