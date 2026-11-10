<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            'plate_number' => strtoupper(fake()->unique()->bothify('??####??')),
            'name' => fake()->name(),
            'phone' => fake()->numerify('02########'),
        ];
    }
}
