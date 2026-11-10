<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Database\Factories\VehicleCategoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VehicleCategory extends Model
{
    /** @use HasFactory<VehicleCategoryFactory> */
    use BelongsToBranch, HasFactory, HasUuidSync;

    protected $fillable = [
        'id', 'branch_id', 'name', 'min_price', 'max_price', 'pricing_note', 'sort_order', 'active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'min_price' => 'integer', // pesewas
            'max_price' => 'integer', // pesewas
            'sort_order' => 'integer',
            'active' => 'boolean',
        ];
    }

    /**
     * @return HasMany<Sale, $this>
     */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'category_id');
    }
}
