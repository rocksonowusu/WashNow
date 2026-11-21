<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToBranch, HasApiTokens, HasFactory, HasUuidSync;

    // is_admin is deliberately not fillable: only `php artisan washnow:admin` sets it.
    protected $fillable = ['id', 'branch_id', 'name', 'phone', 'pin_hash', 'role', 'active'];

    // Left out of the sync feed. is_admin is only ever sent to the person
    // themselves (UserResource), never to their bay's devices.
    protected $hidden = ['pin_hash', 'is_admin'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            // Assigning a plain PIN to pin_hash stores its hash.
            'pin_hash' => 'hashed',
            'role' => UserRole::class,
            'active' => 'boolean',
            'is_admin' => 'boolean',
        ];
    }

    /** Runs WashNow itself: can create and manage every washing bay. */
    public function isAdmin(): bool
    {
        return $this->is_admin === true && $this->active;
    }

    /**
     * Staff type phone numbers with spaces or dashes; store and compare one form.
     */
    /**
     * Spaces and dashes are dropped, and a Ghana number written the
     * international way (+233 55 123 4567 or 233551234567) is kept the local
     * way (0551234567), so either form signs in to the same account.
     */
    public static function normalisePhone(string $phone): string
    {
        $phone = preg_replace('/[^0-9+]/', '', $phone) ?? '';

        if (preg_match('/^\+?233(\d{9})$/', $phone, $match)) {
            return '0'.$match[1];
        }

        return $phone;
    }

    public function isOwner(): bool
    {
        return $this->role === UserRole::Owner;
    }

    public function isCashier(): bool
    {
        return $this->role === UserRole::Cashier;
    }
}
