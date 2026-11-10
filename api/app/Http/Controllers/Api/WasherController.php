<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Washer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WasherController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $washers = Washer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $washers]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules(required: true));

        $washer = Washer::query()->create(['branch_id' => $request->user()->branch_id] + $data);

        return response()->json(['data' => $washer->refresh()], 201);
    }

    /**
     * Changing commission_percent only affects future sales; past sales keep
     * the percentage that was copied onto them. The change itself is kept in
     * the audit log.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $washer = $this->find($request, $id);

        $washer->update($request->validate($this->rules(required: false)));

        return response()->json(['data' => $washer]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->find($request, $id)->delete();

        return response()->json(['message' => 'Washer removed.']);
    }

    private function find(Request $request, string $id): Washer
    {
        return Washer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }

    /**
     * @return array<string, list<string>>
     */
    private function rules(bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            'name' => [$presence, 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'commission_percent' => [$presence, 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
