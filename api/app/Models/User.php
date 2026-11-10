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

    protected $fillable = ['id', 'branch_id', 'name', 'phone', 'pin_hash', 'role', 'active'];

    protected $hidden = ['pin_hash'];

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
        ];
    }

    /**
     * Staff type phone numbers with spaces or dashes; store and compare one form.
     */
    public static function normalisePhone(string $phone): string
    {
        return preg_replace('/[^0-9+]/', '', $phone) ?? '';
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
