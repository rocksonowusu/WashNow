<?php

namespace App\Http\Controllers\Api;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Sales are recorded and voided, never edited away or deleted, so there is no
 * update or destroy here.
 */
class SaleController extends Controller
{
    public function __construct(private readonly SaleService $sales) {}

    /**
     * One day's sales with totals. Cashiers always get today; the owner may
     * pass ?date=YYYY-MM-DD.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate(['date' => ['nullable', 'date_format:Y-m-d']]);

        $user = $request->user();
        $date = $user->isOwner() && $request->filled('date')
            ? Carbon::parse($request->query('date'), config('app.timezone'))
            : today();

        $sales = Sale::query()
            ->where('branch_id', $user->branch_id)
            ->whereBetween('sold_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->with('saleWashers')
            ->orderByDesc('sold_at')
            ->get();

        $active = $sales->where('status', SaleStatus::Active);

        return response()->json([
            'data' => $sales,
            'totals' => [
                'date' => $date->toDateString(),
                'count' => $active->count(),
                'total' => (int) $active->sum('amount'),
                'cash' => (int) $active->where('payment_method', PaymentMethod::Cash)->sum('amount'),
                'momo' => (int) $active->where('payment_method', PaymentMethod::Momo)->sum('amount'),
            ],
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->find($request, $id)->load('saleWashers')]);
    }

    /**
     * amount is whole pesewas: GH₵35.00 is sent as 3500.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['sometimes', 'uuid', 'unique:sales,id'],
            'category_id' => ['required', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'plate_number' => ['nullable', 'string', 'max:20'],
            'service_note' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'integer', 'min:1', 'max:100000000'],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            'washer_ids' => ['required', 'array', 'min:1', 'max:6'],
            'washer_ids.*' => ['uuid', 'distinct'],
            'sold_at' => ['nullable', 'date'],
            'override_reason' => ['nullable', 'string', 'max:255'],
        ], [
            'washer_ids.required' => 'Choose at least one washer.',
        ]);

        $sale = $this->sales->create($request->user(), $data);

        return response()->json(['data' => $sale], 201);
    }

    public function void(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $sale = $this->sales->void($this->find($request, $id), $data['reason']);

        return response()->json(['data' => $sale]);
    }

    private function find(Request $request, string $id): Sale
    {
        return Sale::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }
}
