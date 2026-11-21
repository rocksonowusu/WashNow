<?php

namespace App\Http\Controllers\Api;

use App\Exports\ReportExport;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Services\ReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\Response;

/**
 * Figures for a run of days, on screen or as a file: the owner for their own
 * bay, and the WashNow admin for any bay (the admin* actions).
 */
class ReportController extends Controller
{
    /**
     * ?from=YYYY-MM-DD&to=YYYY-MM-DD
     */
    public function summary(Request $request): JsonResponse
    {
        return $this->summaryFor($request, $request->user()->branch);
    }

    /**
     * ?from=&to=&format=xlsx|pdf. Sends the file as a download.
     */
    public function export(Request $request): Response
    {
        return $this->exportFor($request, $request->user()->branch);
    }

    /** The WashNow admin: the same report for any bay. */
    public function adminSummary(Request $request, string $id): JsonResponse
    {
        return $this->summaryFor($request, Branch::query()->findOrFail($id));
    }

    public function adminExport(Request $request, string $id): Response
    {
        // The admin downloads files for many bays, so the bay's name is in the file name.
        return $this->exportFor($request, Branch::query()->findOrFail($id), withBayName: true);
    }

    private function summaryFor(Request $request, Branch $branch): JsonResponse
    {
        [$from, $to] = $this->range($request);

        return response()->json(['data' => ReportService::summary($branch->id, $from, $to)]);
    }

    private function exportFor(Request $request, Branch $branch, bool $withBayName = false): Response
    {
        [$from, $to] = $this->range($request);
        $format = $request->validate(['format' => ['required', 'in:xlsx,pdf']])['format'];

        $name = 'washnow-report-'.($withBayName ? Str::slug($branch->name).'-' : '').($from === $to ? $from : "{$from}-to-{$to}");

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
