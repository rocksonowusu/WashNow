<?php

namespace App\Services;

use App\Enums\ExpenseCategory;
use App\Enums\PaymentMethod;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    public const EDITABLE = ['category', 'amount', 'payment_method', 'note', 'spent_at'];

    /**
     * Shape rules shared by the REST endpoints and sync. amount is whole pesewas.
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(bool $creating = true): array
    {
        $presence = $creating ? 'required' : 'sometimes';

        return [
            'category' => [$presence, Rule::enum(ExpenseCategory::class)],
            'amount' => [$presence, 'integer', 'min:1', 'max:100000000'],
            'payment_method' => [$presence, Rule::enum(PaymentMethod::class)],
            'note' => ['nullable', 'string', 'max:255'],
            'spent_at' => ['nullable', 'date'],
        ];
    }

    /**
     * @param  array<string, mixed>  $data  Already validated with rules().
     */
    public function create(User $user, array $data): Expense
    {
        $data['spent_at'] = self::spentAt($data['spent_at'] ?? null) ?? now();
        DayLock::ensureOpen($user->branch_id, $data['spent_at'], 'spent_at');

        return Expense::query()->create(
            ['branch_id' => $user->branch_id, 'recorded_by' => $user->id] + $data
        )->refresh();
    }

    /**
     * @param  array<string, mixed>  $data  Already validated with rules(creating: false).
     */
    public function update(Expense $expense, array $data): Expense
    {
        // Neither the day it is in now nor the day it is moving to may be closed.
        DayLock::ensureOpen($expense->branch_id, $expense->spent_at, 'spent_at');

        if (array_key_exists('spent_at', $data)) {
            $data['spent_at'] = self::spentAt($data['spent_at']) ?? $expense->spent_at;
            DayLock::ensureOpen($expense->branch_id, $data['spent_at'], 'spent_at');
        }

        $expense->update($data);

        return $expense;
    }

    public function delete(Expense $expense): void
    {
        DayLock::ensureOpen($expense->branch_id, $expense->spent_at, 'spent_at');

        $expense->delete();
    }

    /**
     * The time in the app's timezone, or null when none was given.
     *
     * @throws ValidationException
     */
    public static function spentAt(?string $value): ?Carbon
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
}
