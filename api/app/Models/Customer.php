<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use BelongsToBranch, HasUuidSync;

    // visit_count and total_spent are left out on purpose: the server
    // recalculates them from sales and never accepts them from a device.
    protected $fillable = ['id', 'branch_id', 'plate_number', 'name', 'phone', 'notes'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'visit_count' => 'integer',
            'total_spent' => 'integer', // pesewas
        ];
    }

    /**
     * @return HasMany<Sale, $this>
     */
    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}
