<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Support\PlateNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    /**
     * Optional ?q= searches plate number, name and phone.
     */
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('q', ''));
        $plate = PlateNumber::normalise($search);

        $customers = Customer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->when($search !== '', function ($query) use ($search, $plate) {
                $query->where(function ($query) use ($search, $plate) {
                    $query->where('name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");

                    if ($plate !== null) {
                        $query->orWhere('plate_number', 'like', "%{$plate}%");
                    }
                });
            })
            ->orderByDesc('visit_count')
            ->orderBy('plate_number')
            ->paginate(50);

        return response()->json($customers);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->find($request, $id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $data = $this->validated($request, $branchId);

        $customer = new Customer(['branch_id' => $branchId] + $data);
        $customer->save();

        return response()->json(['data' => $customer->refresh()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $customer = $this->find($request, $id);

        $customer->update($this->validated($request, $customer->branch_id, $customer));

        return response()->json(['data' => $customer]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->find($request, $id)->delete();

        return response()->json(['message' => 'Customer removed.']);
    }

    private function find(Request $request, string $id): Customer
    {
        return Customer::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);
    }

    /**
     * visit_count and total_spent are never accepted here; the server works
     * them out from sales.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request, string $branchId, ?Customer $customer = null): array
    {
        if ($request->has('plate_number')) {
            $request->merge(['plate_number' => PlateNumber::normalise($request->input('plate_number'))]);
        }

        return $request->validate([
            'id' => $customer ? ['prohibited'] : ['sometimes', 'uuid', 'unique:customers,id'],
            'plate_number' => [
                $customer ? 'sometimes' : 'required', 'string', 'max:20',
                // Removed customers still hold their plate, so they count too.
                Rule::unique('customers')->where('branch_id', $branchId)->ignore($customer?->id),
            ],
            'name' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [
            'plate_number.unique' => 'A customer with this plate number already exists.',
        ]);
    }
}
