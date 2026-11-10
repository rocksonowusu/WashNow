<?php

namespace App\Http\Controllers\Api;

use App\Enums\ExpenseCategory;
use App\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Services\DayLock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ExpenseController extends Controller
{
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
        $user = $request->user();
        $data = $request->validate(['id' => ['sometimes', 'uuid', 'unique:expenses,id']] + $this->rules(required: true));

        $data['spent_at'] = $this->spentAt($data['spent_at'] ?? null) ?? now();
        DayLock::ensureOpen($user->branch_id, $data['spent_at'], 'spent_at');

        $expense = Expense::query()->create(
            ['branch_id' => $user->branch_id, 'recorded_by' => $user->id] + $data
        );

        return response()->json(['data' => $expense->refresh()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $expense = $this->find($request, $id);
        $data = $request->validate($this->rules(required: false));

        // Neither the day it is in now nor the day it is moving to may be closed.
        DayLock::ensureOpen($expense->branch_id, $expense->spent_at, 'spent_at');

        if (array_key_exists('spent_at', $data)) {
            $data['spent_at'] = $this->spentAt($data['spent_at']) ?? $expense->spent_at;
            DayLock::ensureOpen($expense->branch_id, $data['spent_at'], 'spent_at');
        }

        $expense->update($data);

        return response()->json(['data' => $expense]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $expense = $this->find($request, $id);

        DayLock::ensureOpen($expense->branch_id, $expense->spent_at, 'spent_at');
        $expense->delete();

        return response()->json(['message' => 'Expense removed.']);
    }

    private function find(Request $request, string $id): Expense
    {
        return Expense::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }

    private function spentAt(?string $value): ?Carbon
    {
        if ($value === null) {
            return null;
        }

        $spentAt = Carbon::parse($value)->setTimezone(config('app.timezone'));

        if ($spentAt->isAfter(now()->addMinutes(5))) {
            throw ValidationException::withMessages(['spent_at' => ['An expense cannot be dated in the future.']]);
        }

        return $spentAt;
    }

    /**
     * amount is whole pesewas.
     *
     * @return array<string, list<mixed>>
     */
    private function rules(bool $required): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            'category' => [$presence, Rule::enum(ExpenseCategory::class)],
            'amount' => [$presence, 'integer', 'min:1', 'max:100000000'],
            'payment_method' => [$presence, Rule::enum(PaymentMethod::class)],
            'note' => ['nullable', 'string', 'max:255'],
            'spent_at' => ['nullable', 'date'],
        ];
    }
}
