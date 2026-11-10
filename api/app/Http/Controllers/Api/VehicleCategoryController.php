<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VehicleCategory;
use App\Support\SettingRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleCategoryController extends Controller
{
    public const FIELDS = ['name', 'min_price', 'max_price', 'pricing_note', 'sort_order', 'active'];

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
        $data = SettingRules::category($request->all(), $branchId);

        $category = VehicleCategory::query()->create(['branch_id' => $branchId] + $data);

        return response()->json(['data' => $category->refresh()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $category = $this->find($request, $id);

        $data = SettingRules::category(
            array_merge($category->only(self::FIELDS), $request->all()),
            $category->branch_id,
            $category->id,
        );

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
}
