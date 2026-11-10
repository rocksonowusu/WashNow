<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Washer;
use App\Services\CrewService;
use App\Support\SettingRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The crew: the people who wash the vehicles.
 */
class WasherController extends Controller
{
    public function __construct(private readonly CrewService $crew) {}

    public function index(Request $request): JsonResponse
    {
        $washers = Washer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $washers]);
    }

    /**
     * Open to cashiers too. A cashier's addition starts on the bay's standard
     * commission; the owner may give a different rate.
     */
    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->crew->create($request->user(), $request->all())], 201);
    }

    /**
     * Owner only. Changing commission_percent only affects future sales; past
     * sales keep the percentage that was copied onto them. The change itself
     * is kept in the audit log.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $washer = $this->find($request, $id);
        $data = SettingRules::washer($request->all(), creating: false);

        if (isset($data['name'])) {
            $data['name'] = CrewService::cleanName($data['name']);

            if ($this->crew->findByName($washer->branch_id, $data['name'], $washer->id)) {
                throw ValidationException::withMessages(['name' => ["{$data['name']} is already on the crew list."]]);
            }
        }

        $washer->update($data);

        return response()->json(['data' => $washer]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->find($request, $id)->delete();

        return response()->json(['message' => 'Crew member removed.']);
    }

    private function find(Request $request, string $id): Washer
    {
        return Washer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }
}
