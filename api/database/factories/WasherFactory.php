<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Washer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Washer>
 */
class WasherFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            'name' => fake()->firstName(),
            'phone' => fake()->numerify('05########'),
            'commission_percent' => 30,
            'active' => true,
        ];
    }
}
