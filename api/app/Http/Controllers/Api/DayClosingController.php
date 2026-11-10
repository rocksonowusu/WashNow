<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DayClosing;
use App\Services\DayLock;
use App\Services\DaySummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DayClosingController extends Controller
{
    /**
     * Live totals for a day (default today), whether or not it is closed.
     */
    public function summary(Request $request): JsonResponse
    {
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);

        $branchId = $request->user()->branch_id;
        $date = $request->query('date') ?? today()->toDateString();

        return response()->json([
            'data' => DaySummary::for($branchId, $date) + ['closed' => DayLock::isClosed($branchId, $date)],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $closings = DayClosing::query()
            ->where('branch_id', $request->user()->branch_id)
            ->orderByDesc('date')
            ->paginate(31);

        return response()->json($closings);
    }

    /**
     * Saves the day's totals as they are now and locks the day.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
        ], [
            'date.before_or_equal' => 'A day that has not started yet cannot be closed.',
        ]);

        $user = $request->user();

        if (DayLock::isClosed($user->branch_id, $data['date'])) {
            throw ValidationException::withMessages(['date' => [$data['date'].' is already closed.']]);
        }

        $closing = DayClosing::query()->create([
            'branch_id' => $user->branch_id,
            'date' => $data['date'],
            'totals' => DaySummary::for($user->branch_id, $data['date']),
            'closed_by' => $user->id,
            'closed_at' => now(),
        ]);

        return response()->json(['data' => $closing->refresh()], 201);
    }
}
