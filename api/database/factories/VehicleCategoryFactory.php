<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\VehicleCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VehicleCategory>
 */
class VehicleCategoryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            'name' => fake()->unique()->word(),
            'min_price' => 1500,
            'max_price' => 10000,
            'pricing_note' => null,
            'sort_order' => 0,
            'active' => true,
        ];
    }
}
