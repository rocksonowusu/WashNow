<?php

namespace App\Support;

use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Validation for the owner's settings, shared by the REST endpoints and sync.
 */
final class SettingRules
{
    /**
     * Prices are whole pesewas: GH₵15.00 is 1500. Pass the saved values merged
     * under the new ones when updating, so a lone max_price is still compared
     * with the existing min_price.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public static function category(array $input, string $branchId, ?string $ignoreId = null): array
    {
        return Validator::make($input, [
            'name' => [
                'required', 'string', 'max:100',
                Rule::unique('vehicle_categories')
                    ->where('branch_id', $branchId)
                    ->whereNull('deleted_at')
                    ->ignore($ignoreId),
            ],
            'min_price' => ['required', 'integer', 'min:0'],
            'max_price' => ['required', 'integer', 'gte:min_price'],
            'pricing_note' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'active' => ['sometimes', 'boolean'],
        ], [
            'max_price.gte' => 'The highest price cannot be lower than the lowest price.',
        ])->validate();
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public static function washer(array $input, bool $creating): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        return Validator::make($input, [
            'name' => [$presence, 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'commission_percent' => [$presence, 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
            'active' => ['sometimes', 'boolean'],
        ])->validate();
    }
}
