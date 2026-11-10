<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Models\VehicleCategory;
use Illuminate\Database\Seeder;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    /**
     * Name, min and max in whole cedis, and what the price depends on.
     * Stored in pesewas.
     */
    private const CATEGORIES = [
        ['Sedan', 15, 100, 'Parts washed'],
        ['SUV', 20, 150, 'Parts washed'],
        ['Bus', 40, 200, 'Parts washed'],
        ['Pickup truck', 40, 200, 'Parts washed'],
        ['Tipper / container truck', 100, 400, 'Number of tyres'],
        ['Heavy-duty machine', 40, 400, 'Machine type'],
    ];

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

        foreach (self::CATEGORIES as $position => [$name, $min, $max, $note]) {
            VehicleCategory::query()->firstOrCreate(
                ['branch_id' => $branch->id, 'name' => $name],
                [
                    'min_price' => $min * 100,
                    'max_price' => $max * 100,
                    'pricing_note' => $note,
                    'sort_order' => $position + 1,
                    'active' => true,
                ],
            );
        }
    }
}
