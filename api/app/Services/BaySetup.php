<?php

namespace App\Services;

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use App\Models\VehicleCategory;
use Illuminate\Support\Facades\DB;

/**
 * Everything a new washing bay needs on day one: the bay, its owner, and the
 * usual vehicle types with their price ranges (the owner adjusts them in
 * Settings).
 */
class BaySetup
{
    /**
     * Name, min and max in whole cedis, and what the price depends on.
     * Stored in pesewas.
     */
    public const CATEGORIES = [
        ['Sedan', 15, 100, 'Parts washed'],
        ['SUV', 20, 150, 'Parts washed'],
        ['Bus', 40, 200, 'Parts washed'],
        ['Pickup truck', 40, 200, 'Parts washed'],
        ['Tipper / container truck', 100, 400, 'Number of tyres'],
        ['Heavy-duty machine', 40, 400, 'Machine type'],
    ];

    /**
     * @param  array{name: string, location?: ?string, phone?: ?string}  $bay
     * @param  array{name: string, phone: string, pin: string}  $owner
     * @return array{0: Branch, 1: User}
     */
    public function create(array $bay, array $owner): array
    {
        return DB::transaction(function () use ($bay, $owner) {
            $branch = Branch::query()->create([
                'name' => $bay['name'],
                'location' => $bay['location'] ?? null,
                'phone' => $bay['phone'] ?? null,
            ]);

            $user = User::query()->create([
                'branch_id' => $branch->id,
                'name' => $owner['name'],
                'phone' => User::normalisePhone($owner['phone']),
                'pin_hash' => $owner['pin'],
                'role' => UserRole::Owner,
                'active' => true,
            ]);

            $this->addDefaultCategories($branch);

            return [$branch, $user];
        });
    }

    /** Safe to run again: vehicle types that already exist are left alone. */
    public function addDefaultCategories(Branch $branch): void
    {
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
