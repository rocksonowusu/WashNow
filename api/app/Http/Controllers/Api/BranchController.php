<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in user's own bay and its settings.
 */
class BranchController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->branch]);
    }

    /**
     * Owner only. default_commission_percent is the rate new crew start on
     * when a cashier adds them; send null to clear it.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'default_commission_percent' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
        ]);

        $branch = $request->user()->branch;
        $branch->update($data);

        return response()->json(['data' => $branch]);
    }
}
