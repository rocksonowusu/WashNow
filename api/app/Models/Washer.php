<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Washer extends Model
{
    use BelongsToBranch, HasUuidSync;

    protected $fillable = ['id', 'branch_id', 'name', 'phone', 'commission_percent', 'active'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'commission_percent' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    /**
     * @return HasMany<SaleWasher, $this>
     */
    public function saleWashers(): HasMany
    {
        return $this->hasMany(SaleWasher::class);
    }
}
