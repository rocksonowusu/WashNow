<?php

namespace App\Models;

use App\Models\Concerns\HasUuidSync;
use Database\Factories\BranchFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    /** @use HasFactory<BranchFactory> */
    use HasFactory, HasUuidSync;

    protected $fillable = ['id', 'name', 'location', 'phone', 'default_commission_percent'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'default_commission_percent' => 'decimal:2',
        ];
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * @return HasMany<VehicleCategory, $this>
     */
    public function vehicleCategories(): HasMany
    {
        return $this->hasMany(VehicleCategory::class);
    }
}
