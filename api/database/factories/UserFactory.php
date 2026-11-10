<?php

namespace Database\Factories;

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /** PIN every factory user gets unless a test sets another one. */
    public const DEFAULT_PIN = '1234';

    protected static ?string $pinHash = null;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'branch_id' => Branch::factory(),
            'name' => fake()->name(),
            'phone' => fake()->unique()->numerify('02########'),
            'pin_hash' => static::$pinHash ??= Hash::make(self::DEFAULT_PIN),
            'role' => UserRole::Cashier,
            'active' => true,
        ];
    }

    public function owner(): static
    {
        return $this->state(['role' => UserRole::Owner]);
    }

    public function cashier(): static
    {
        return $this->state(['role' => UserRole::Cashier]);
    }

    public function inactive(): static
    {
        return $this->state(['active' => false]);
    }
}
