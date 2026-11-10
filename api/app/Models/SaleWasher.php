<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleWasher extends Model
{
    use BelongsToBranch, HasUuidSync;

    protected $fillable = [
        'id', 'branch_id', 'sale_id', 'washer_id', 'commission_percent', 'commission_amount',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'commission_percent' => 'decimal:2',
            'commission_amount' => 'integer', // pesewas
        ];
    }

    /**
     * @return BelongsTo<Sale, $this>
     */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    /**
     * @return BelongsTo<Washer, $this>
     */
    public function washer(): BelongsTo
    {
        return $this->belongsTo(Washer::class);
    }
}
