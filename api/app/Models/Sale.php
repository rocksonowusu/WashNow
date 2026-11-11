<?php

namespace App\Models;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\Concerns\BelongsToBranch;
use App\Models\Concerns\HasUuidSync;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use BelongsToBranch, HasUuidSync;

    protected $fillable = [
        'id', 'branch_id', 'category_id', 'customer_id', 'plate_number', 'service_note', 'amount',
        'payment_method', 'recorded_by', 'sold_at', 'status', 'void_reason', 'override_reason',
    ];

    protected $attributes = [
        'status' => SaleStatus::Active->value,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'integer', // pesewas
            'payment_method' => PaymentMethod::class,
            'status' => SaleStatus::class,
            'sold_at' => 'datetime',
            'void_requested_at' => 'datetime',
        ];
    }

    /**
     * A cashier has asked for this sale to be voided and the owner has not
     * answered yet.
     */
    public function hasVoidRequest(): bool
    {
        return $this->void_requested_at !== null && ! $this->isVoided();
    }

    /**
     * @return BelongsTo<VehicleCategory, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(VehicleCategory::class, 'category_id');
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /**
     * @return HasMany<SaleWasher, $this>
     */
    public function saleWashers(): HasMany
    {
        return $this->hasMany(SaleWasher::class);
    }

    public function isVoided(): bool
    {
        return $this->status === SaleStatus::Voided;
    }
}
