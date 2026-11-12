<?php

namespace App\Exports;

use App\Services\ReportService;
use Maatwebsite\Excel\Concerns\Export;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

/**
 * The owner's report as an Excel workbook: a summary, then one sheet each for
 * days, every sale, crew pay, vehicle types, every expense and top customers.
 * Money is in cedis (GH₵), as numbers, so the columns can be added up.
 */
class ReportExport implements Export, WithMultipleSheets
{
    public function __construct(
        private readonly string $branchId,
        private readonly string $branchName,
        private readonly string $from,
        private readonly string $to,
    ) {}

    /**
     * @return list<ArraySheet>
     */
    public function sheets(): array
    {
        $report = ReportService::summary($this->branchId, $this->from, $this->to);
        $totals = $report['totals'];
        $cedis = fn (int $pesewas): float => $pesewas / 100;

        return [
            new ArraySheet('Summary', ['WashNow report', $this->branchName], [
                ['From', $report['from']],
                ['To', $report['to']],
                ['Vehicles washed', $totals['vehicles']],
                ['Total sales (GH₵)', $cedis($totals['sales'])],
                ['Cash (GH₵)', $cedis($totals['cash'])],
                ['MoMo (GH₵)', $cedis($totals['momo'])],
                ['Expenses (GH₵)', $cedis($totals['expenses'])],
                ['Crew commission (GH₵)', $cedis($totals['commission'])],
                ['Left after expenses and commission (GH₵)', $cedis($totals['net'])],
                ['Voided sales', $totals['voided']],
            ]),

            new ArraySheet('By day', ['Date', 'Vehicles', 'Sales (GH₵)', 'Expenses (GH₵)'], array_map(
                fn (array $day) => [$day['date'], $day['vehicles'], $cedis($day['sales']), $cedis($day['expenses'])],
                $report['daily'],
            )),

            new ArraySheet(
                'Sales',
                ['Date and time', 'Vehicle', 'Plate', 'Amount (GH₵)', 'Paid with', 'Washed by', 'Commission (GH₵)', 'Recorded by', 'Note', 'Status'],
                array_map(
                    fn (array $row) => [
                        $row['sold_at'], $row['vehicle'], $row['plate'], $cedis($row['amount']), $row['payment'],
                        $row['crew'], $cedis($row['commission']), $row['recorded_by'], $row['note'], $row['status'],
                    ],
                    ReportService::saleRows($this->branchId, $this->from, $this->to),
                ),
            ),

            new ArraySheet('Crew pay', ['Name', 'Vehicles washed', 'Commission owed (GH₵)'], array_map(
                fn (array $row) => [$row['name'], $row['vehicles'], $cedis($row['commission'])],
                $report['by_crew'],
            )),

            new ArraySheet('By vehicle', ['Vehicle', 'Washed', 'Sales (GH₵)'], array_map(
                fn (array $row) => [$row['name'], $row['vehicles'], $cedis($row['amount'])],
                $report['by_vehicle'],
            )),

            new ArraySheet(
                'Expenses',
                ['Date and time', 'Spent on', 'Amount (GH₵)', 'Paid with', 'Note', 'Recorded by'],
                array_map(
                    fn (array $row) => [$row['spent_at'], $row['category'], $cedis($row['amount']), $row['payment'], $row['note'], $row['recorded_by']],
                    ReportService::expenseRows($this->branchId, $this->from, $this->to),
                ),
            ),

            new ArraySheet('Top customers', ['Plate', 'Name', 'Visits', 'Spent (GH₵)'], array_map(
                fn (array $row) => [$row['plate_number'], $row['name'] ?? '', $row['visits'], $cedis($row['spent'])],
                $report['top_customers'],
            )),
        ];
    }
}
