<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VehicleCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class VehicleCategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $categories = VehicleCategory::query()
            ->where('branch_id', $request->user()->branch_id)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $data = $this->validated($request->all(), $branchId);

        $category = VehicleCategory::query()->create(['branch_id' => $branchId] + $data);

        return response()->json(['data' => $category->refresh()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $category = $this->find($request, $id);

        // Check the request on top of the saved values, so sending only
        // max_price is still compared with the existing min_price.
        $current = $category->only(['name', 'min_price', 'max_price', 'pricing_note', 'sort_order', 'active']);
        $data = $this->validated(array_merge($current, $request->all()), $category->branch_id, $category->id);

        $category->update($data);

        return response()->json(['data' => $category]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->find($request, $id)->delete();

        return response()->json(['message' => 'Category removed.']);
    }

    private function find(Request $request, string $id): VehicleCategory
    {
        return VehicleCategory::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }

    /**
     * Prices are whole pesewas: GH₵15.00 is sent as 1500.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    private function validated(array $input, string $branchId, ?string $ignoreId = null): array
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
}
