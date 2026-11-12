<?php

use App\Models\Customer;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\IOFactory;

beforeEach(function () {
    $this->travelTo('2026-11-10 14:00:00');
});

/**
 * Two days of trading:
 * 9 Nov  - one GH₵30 Sedan (Kofi, MoMo) and GH₵10 of water.
 * 10 Nov - GH₵100 Sedan shared by Kofi and Ama (cash, a saved customer),
 *          GH₵50 Sedan by Kofi (MoMo, same customer), a voided GH₵40 sale,
 *          and GH₵20 of soap.
 */
function tradeForTwoDays(stdClass $bay): Customer
{
    $customer = Customer::factory()->for($bay->branch)->create(['plate_number' => 'GR123421', 'name' => 'Mr Mensah']);

    recordSale($bay, $bay->cashier, ['amount' => 3000, 'payment_method' => 'momo', 'sold_at' => '2026-11-09T11:00:00+00:00']);
    test()->postJson('/api/expenses', ['category' => 'water', 'amount' => 1000, 'payment_method' => 'cash', 'spent_at' => '2026-11-09T12:00:00+00:00'])->assertCreated();

    recordSale($bay, $bay->cashier, ['amount' => 10000, 'payment_method' => 'cash', 'washer_ids' => [$bay->kofi->id, $bay->ama->id], 'customer_id' => $customer->id]);
    recordSale($bay, $bay->cashier, ['amount' => 5000, 'payment_method' => 'momo', 'customer_id' => $customer->id]);
    $voidId = recordSale($bay, $bay->cashier, ['amount' => 4000])->json('data.id');
    test()->postJson('/api/expenses', ['category' => 'soap', 'amount' => 2000, 'payment_method' => 'cash'])->assertCreated();

    Sanctum::actingAs($bay->owner);
    test()->postJson("/api/sales/{$voidId}/void", ['reason' => 'Entered twice'])->assertOk();

    return $customer;
}

it('adds up a range of days for the owner', function () {
    $bay = bay();
    $customer = tradeForTwoDays($bay);

    $response = $this->getJson('/api/reports/summary?from=2026-11-09&to=2026-11-10')->assertOk();

    // Sales 30 + 100 + 50 = GH₵180. Commission: Kofi 9 + 15 + 15 = 39, Ama 20.
    $response->assertJsonPath('data.totals', [
        'vehicles' => 3,
        'sales' => 18000,
        'cash' => 10000,
        'momo' => 8000,
        'expenses' => 3000,
        'commission' => 5900,
        'net' => 9100,
        'voided' => 1,
    ]);

    $response->assertJsonPath('data.daily', [
        ['date' => '2026-11-09', 'vehicles' => 1, 'sales' => 3000, 'expenses' => 1000],
        ['date' => '2026-11-10', 'vehicles' => 2, 'sales' => 15000, 'expenses' => 2000],
    ]);

    $response->assertJsonPath('data.by_crew', [
        ['washer_id' => $bay->ama->id, 'name' => 'Ama', 'vehicles' => 1, 'commission' => 2000],
        ['washer_id' => $bay->kofi->id, 'name' => 'Kofi', 'vehicles' => 3, 'commission' => 3900],
    ]);

    $response->assertJsonPath('data.by_vehicle.0.name', 'Sedan')
        ->assertJsonPath('data.by_vehicle.0.vehicles', 3)
        ->assertJsonPath('data.by_vehicle.0.amount', 18000)
        ->assertJsonPath('data.expenses_by_category', [
            ['category' => 'soap', 'amount' => 2000],
            ['category' => 'water', 'amount' => 1000],
        ])
        ->assertJsonPath('data.top_customers', [
            ['customer_id' => $customer->id, 'visits' => 2, 'spent' => 15000, 'plate_number' => 'GR123421', 'name' => 'Mr Mensah'],
        ]);
});

it('reports a single day, with zeros for a day when nothing happened', function () {
    $bay = bay();
    tradeForTwoDays($bay);

    $this->getJson('/api/reports/summary?from=2026-11-10&to=2026-11-10')
        ->assertOk()
        ->assertJsonPath('data.totals.sales', 15000)
        ->assertJsonPath('data.totals.expenses', 2000)
        ->assertJsonCount(1, 'data.daily');

    $this->getJson('/api/reports/summary?from=2026-11-01&to=2026-11-01')
        ->assertOk()
        ->assertJsonPath('data.totals.sales', 0)
        ->assertJsonPath('data.totals.net', 0)
        ->assertJsonPath('data.daily', [['date' => '2026-11-01', 'vehicles' => 0, 'sales' => 0, 'expenses' => 0]])
        ->assertJsonPath('data.by_crew', []);
});

it('only counts the owner\'s own bay', function () {
    $bay = bay();
    $other = bay();
    recordSale($other, $other->cashier, ['amount' => 9000])->assertCreated();

    Sanctum::actingAs($bay->owner);
    $this->getJson('/api/reports/summary?from=2026-11-10&to=2026-11-10')->assertJsonPath('data.totals.sales', 0);
});

it('checks the dates', function (string $query, string $field) {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $this->getJson("/api/reports/summary?{$query}")->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'no dates' => ['', 'from'],
    'end before start' => ['from=2026-11-10&to=2026-11-09', 'to'],
    'not a date' => ['from=yesterday&to=2026-11-10', 'from'],
    'more than a year' => ['from=2025-01-01&to=2026-11-10', 'to'],
]);

it('keeps reports and exports away from cashiers', function () {
    $bay = bay();
    Sanctum::actingAs($bay->cashier);

    $this->getJson('/api/reports/summary?from=2026-11-10&to=2026-11-10')->assertForbidden();
    $this->getJson('/api/reports/export?from=2026-11-10&to=2026-11-10&format=xlsx')->assertForbidden();
});

it('downloads the report as an Excel workbook', function () {
    $bay = bay();
    tradeForTwoDays($bay);

    $response = $this->get('/api/reports/export?from=2026-11-09&to=2026-11-10&format=xlsx', ['Accept' => 'application/json'])
        ->assertOk()
        ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect($response->headers->get('content-disposition'))->toContain('washnow-report-2026-11-09-to-2026-11-10.xlsx');

    // Open the file that was sent and check the sheets and a figure.
    $workbook = IOFactory::load($response->baseResponse->getFile()->getPathname());

    expect($workbook->getSheetNames())->toBe(['Summary', 'By day', 'Sales', 'Crew pay', 'By vehicle', 'Expenses', 'Top customers'])
        ->and($workbook->getSheetByName('Summary')->getCell('B5')->getValue())->toEqual(180) // total sales in cedis
        ->and($workbook->getSheetByName('Sales')->getHighestRow())->toBe(5) // heading + 4 sales, voided included
        ->and($workbook->getSheetByName('Crew pay')->getCell('C3')->getValue())->toEqual(39);
});

it('downloads the report as a PDF', function () {
    $bay = bay();
    tradeForTwoDays($bay);

    $response = $this->get('/api/reports/export?from=2026-11-10&to=2026-11-10&format=pdf', ['Accept' => 'application/json'])
        ->assertOk()
        ->assertHeader('content-type', 'application/pdf');

    expect($response->headers->get('content-disposition'))->toContain('washnow-report-2026-11-10.pdf')
        ->and(substr($response->getContent(), 0, 4))->toBe('%PDF');
});

it('needs a known file format', function () {
    $bay = bay();
    Sanctum::actingAs($bay->owner);

    $this->getJson('/api/reports/export?from=2026-11-10&to=2026-11-10&format=docx')
        ->assertUnprocessable()->assertJsonValidationErrors('format');
});

describe('the loyalty rule', function () {
    it('is set by the owner and sent to devices', function () {
        $bay = bay();
        Sanctum::actingAs($bay->owner);

        $this->putJson('/api/branch', ['loyalty_every_visits' => 10])
            ->assertOk()->assertJsonPath('data.loyalty_every_visits', 10);
        $this->getJson('/api/sync/pull')->assertJsonPath('tables.branches.0.loyalty_every_visits', 10);

        $this->putJson('/api/branch', ['loyalty_every_visits' => null])
            ->assertOk()->assertJsonPath('data.loyalty_every_visits', null);
    });

    it('must be a sensible number, and only the owner can set it', function () {
        $bay = bay();

        Sanctum::actingAs($bay->owner);
        $this->putJson('/api/branch', ['loyalty_every_visits' => 1])->assertUnprocessable();

        Sanctum::actingAs($bay->cashier);
        $this->putJson('/api/branch', ['loyalty_every_visits' => 10])->assertForbidden();
    });
});
