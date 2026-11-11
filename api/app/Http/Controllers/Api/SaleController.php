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

/**
 * Sales are recorded, corrected by the owner, and voided. They are never
 * deleted, so there is no destroy here.
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

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(
            ['id' => ['sometimes', 'uuid', 'unique:sales,id']] + SaleService::rules(),
            ['washer_ids.required' => 'Choose at least one washer.'],
        );

        return response()->json(['data' => $this->sales->create($request->user(), $data)], 201);
    }

    /**
     * Owner only: correct the amount, payment method, note or plate.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(SaleService::rules(creating: false));

        $sale = $this->sales->update($request->user(), $this->find($request, $id), $data);

        return response()->json(['data' => $sale]);
    }

    public function void(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        return response()->json(['data' => $this->sales->void($this->find($request, $id), $data['reason'])]);
    }

    /**
     * Cashier or owner: ask for a sale to be voided. The owner then voids it
     * (approve) or declines.
     */
    public function requestVoid(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        $sale = $this->sales->requestVoid($request->user(), $this->find($request, $id), $data['reason']);

        return response()->json(['data' => $sale]);
    }

    /**
     * Owner only: turn down a void request. The sale stays as it is.
     */
    public function declineVoid(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->sales->declineVoid($this->find($request, $id))]);
    }

    private function find(Request $request, string $id): Sale
    {
        return Sale::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }
}
