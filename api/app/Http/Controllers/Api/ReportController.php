<?php

namespace App\Http\Controllers\Api;

use App\Exports\ReportExport;
use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Owner only: figures for a run of days, on screen or as a file.
 */
class ReportController extends Controller
{
    /**
     * ?from=YYYY-MM-DD&to=YYYY-MM-DD
     */
    public function summary(Request $request): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => ReportService::summary($request->user()->branch_id, $from, $to)]);
    }

    /**
     * ?from=&to=&format=xlsx|pdf. Sends the file as a download.
     */
    public function export(Request $request): Response
    {
        [$from, $to] = $this->range($request);
        $format = $request->validate(['format' => ['required', 'in:xlsx,pdf']])['format'];

        $branch = $request->user()->branch;
        $name = 'washnow-report-'.($from === $to ? $from : "{$from}-to-{$to}");

        if ($format === 'xlsx') {
            return Excel::download(new ReportExport($branch->id, $branch->name, $from, $to), "{$name}.xlsx");
        }

        return Pdf::loadView('reports.summary', [
            'report' => ReportService::summary($branch->id, $from, $to),
            'branchName' => $branch->name,
        ])->download("{$name}.pdf");
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function range(Request $request): array
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], [
            'to.after_or_equal' => 'The end date cannot be before the start date.',
        ]);

        if (Carbon::parse($data['from'])->diffInDays(Carbon::parse($data['to'])) >= ReportService::MAX_DAYS) {
            throw ValidationException::withMessages(['to' => ['A report can cover at most one year. Choose a shorter range.']]);
        }

        return [$data['from'], $data['to']];
    }
}
