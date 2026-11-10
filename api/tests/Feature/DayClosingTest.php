<?php

use App\Models\DayClosing;
use App\Models\Expense;
use App\Models\Sale;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->travelTo('2026-11-10 14:00:00');
});

/**
 * One day's trading: three sales (one later voided) and one expense.
 */
function tradeForADay(stdClass $bay): string
{
    recordSale($bay, $bay->cashier, ['amount' => 10000, 'payment_method' => 'cash', 'washer_ids' => [$bay->kofi->id, $bay->ama->id]]);
    recordSale($bay, $bay->cashier, ['amount' => 5000, 'payment_method' => 'momo', 'washer_ids' => [$bay->kofi->id]]);
    $voidId = recordSale($bay, $bay->cashier, ['amount' => 4000, 'payment_method' => 'cash'])->json('data.id');

    test()->postJson('/api/expenses', ['category' => 'soap', 'amount' => 2000, 'payment_method' => 'cash'])->assertCreated();

    Sanctum::actingAs($bay->owner);
    test()->postJson("/api/sales/{$voidId}/void", ['reason' => 'Entered twice'])->assertOk();

    return $voidId;
}

it('adds up the day for the owner', function () {
    $bay = bay();
    tradeForADay($bay);

    // Sales GH₵150 (cash 100, MoMo 50). Kofi: 30% of 50 + 30% of 50 = GH₵30.
    // Ama: 40% of 50 = GH₵20. Expenses GH₵20. Net = 150 - 20 - 50 = GH₵80.
    $this->getJson('/api/day-summary')
        ->assertOk()
        ->assertJsonPath('data.date', '2026-11-10')
        ->assertJsonPath('data.cars_washed', 2)
        ->assertJsonPath('data.sales_total', 15000)
        ->assertJsonPath('data.cash_total', 10000)
        ->assertJsonPath('data.momo_total', 5000)
        ->assertJsonPath('data.voided_count', 1)
        ->assertJsonPath('data.expenses_total', 2000)
        ->assertJsonPath('data.commission_total', 5000)
        ->assertJsonPath('data.net', 8000)
        ->assertJsonPath('data.closed', false)
        ->assertJsonPath('data.commissions', [
            ['washer_id' => $bay->ama->id, 'washer_name' => 'Ama', 'cars' => 1, 'amount' => 2000],
            ['washer_id' => $bay->kofi->id, 'washer_name' => 'Kofi', 'cars' => 2, 'amount' => 3000],
        ]);
});

it('saves the totals when the owner closes the day', function () {
    $bay = bay();
    tradeForADay($bay);

    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])
        ->assertCreated()
        ->assertJsonPath('data.date', '2026-11-10')
        ->assertJsonPath('data.closed_by', $bay->owner->id)
        ->assertJsonPath('data.totals.sales_total', 15000)
        ->assertJsonPath('data.totals.net', 8000);

    $this->getJson('/api/day-summary')->assertJsonPath('data.closed', true);

    expect(DayClosing::query()->count())->toBe(1);
});

it('locks a closed day against new sales, voids and expenses', function () {
    $bay = bay();
    $voidedId = tradeForADay($bay);
    $openSaleId = Sale::query()->where('id', '!=', $voidedId)->value('id');
    $expenseId = Expense::query()->value('id');

    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertCreated();

    recordSale($bay, $bay->cashier)->assertUnprocessable()->assertJsonValidationErrors('sold_at');
    recordSale($bay, $bay->owner)->assertUnprocessable()->assertJsonValidationErrors('sold_at');

    $this->postJson("/api/sales/{$openSaleId}/void", ['reason' => 'Too late'])->assertUnprocessable();

    $this->postJson('/api/expenses', ['category' => 'fuel', 'amount' => 1000, 'payment_method' => 'cash'])
        ->assertUnprocessable()->assertJsonValidationErrors('spent_at');
    $this->putJson("/api/expenses/{$expenseId}", ['amount' => 1])->assertUnprocessable();
    $this->deleteJson("/api/expenses/{$expenseId}")->assertUnprocessable();

    expect(Sale::query()->count())->toBe(3)
        ->and(Sale::query()->find($openSaleId)->isVoided())->toBeFalse()
        ->and(Expense::query()->find($expenseId)->amount)->toBe(2000);
});

it('still accepts records for the next day after a close', function () {
    $bay = bay();
    tradeForADay($bay);
    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertCreated();

    $this->travelTo('2026-11-11 08:00:00');

    recordSale($bay, $bay->cashier)->assertCreated();

    // But a late entry dated back into the closed day is refused.
    recordSale($bay, $bay->cashier, ['sold_at' => '2026-11-10T16:00:00+00:00'])
        ->assertUnprocessable()->assertJsonValidationErrors('sold_at');
});

it('cannot close the same day twice or a day in the future', function () {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertCreated();
    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertUnprocessable();
    $this->postJson('/api/day-closings', ['date' => '2026-11-11'])->assertUnprocessable();
});

it('keeps day totals and closing away from cashiers', function () {
    $bay = bay();
    Sanctum::actingAs($bay->cashier);

    $this->getJson('/api/day-summary')->assertForbidden();
    $this->getJson('/api/day-closings')->assertForbidden();
    $this->postJson('/api/day-closings', ['date' => '2026-11-10'])->assertForbidden();
});
