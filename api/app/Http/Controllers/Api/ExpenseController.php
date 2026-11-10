<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Services\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ExpenseController extends Controller
{
    public function __construct(private readonly ExpenseService $expenses) {}

    /**
     * One day's expenses. Cashiers always get today; the owner may pass
     * ?date=YYYY-MM-DD.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);

        $user = $request->user();
        $date = $user->isOwner() && $request->filled('date')
            ? Carbon::parse($request->query('date'), config('app.timezone'))
            : today();

        $expenses = Expense::query()
            ->where('branch_id', $user->branch_id)
            ->whereBetween('spent_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->orderByDesc('spent_at')
            ->get();

        return response()->json([
            'data' => $expenses,
            'totals' => [
                'date' => $date->toDateString(),
                'count' => $expenses->count(),
                'total' => (int) $expenses->sum('amount'),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(
            ['id' => ['sometimes', 'uuid', 'unique:expenses,id']] + ExpenseService::rules()
        );

        return response()->json(['data' => $this->expenses->create($request->user(), $data)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(ExpenseService::rules(creating: false));

        return response()->json(['data' => $this->expenses->update($this->find($request, $id), $data)]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->expenses->delete($this->find($request, $id));

        return response()->json(['message' => 'Expense removed.']);
    }

    private function find(Request $request, string $id): Expense
    {
        return Expense::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }
}
