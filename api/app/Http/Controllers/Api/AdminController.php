<?php

namespace App\Http\Controllers\Api;

use App\Enums\SaleStatus;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Sale;
use App\Models\User;
use App\Services\BaySetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

/**
 * The WashNow admin: every washing bay, with its owner, how busy it is and
 * this month's takings; creating bays and the accounts of the people in them.
 * The admin belongs to no bay. Nothing here syncs to devices; it is online
 * only. (Each bay's detailed report is in ReportController.)
 */
class AdminController extends Controller
{
    public function index(): JsonResponse
    {
        $branches = Branch::query()->orderBy('name')->get();
        $stats = $this->stats();

        return response()->json([
            'data' => $branches->map(fn (Branch $branch) => $this->present($branch, $stats))->values(),
            'month_start' => now()->startOfMonth()->toDateString(),
        ]);
    }

    public function show(string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);

        return response()->json([
            'data' => $this->present($branch, $this->stats()),
            'month_start' => now()->startOfMonth()->toDateString(),
        ]);
    }

    public function store(Request $request, BaySetup $setup): JsonResponse
    {
        $request->merge(['owner_phone' => User::normalisePhone((string) $request->input('owner_phone'))]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', $this->uniqueName()],
            'location' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'owner_name' => ['required', 'string', 'max:100'],
            'owner_phone' => ['required', 'string', 'min:7', 'max:20', Rule::unique('users', 'phone')],
            'owner_pin' => ['required', 'digits:4'],
        ], [
            'name.unique' => 'There is already a washing bay with this name.',
            'owner_phone.unique' => 'Someone already signs in with this phone number. Each person can belong to one bay.',
            'owner_pin.digits' => 'The PIN must be 4 digits.',
        ]);

        [$branch] = $setup->create(
            ['name' => $data['name'], 'location' => $data['location'] ?? null, 'phone' => $data['phone'] ?? null],
            ['name' => $data['owner_name'], 'phone' => $data['owner_phone'], 'pin' => $data['owner_pin']],
        );

        return response()->json(['data' => $this->present($branch, $this->stats())], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100', $this->uniqueName($branch)],
            'location' => ['sometimes', 'nullable', 'string', 'max:100'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
        ], [
            'name.unique' => 'There is already a washing bay with this name.',
        ]);

        $branch->update($data);

        return response()->json(['data' => $this->present($branch, $this->stats())]);
    }

    /** Nobody in the bay can sign in, and every device is signed out now. */
    public function suspend(string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);

        if (! $branch->isSuspended()) {
            DB::transaction(function () use ($branch) {
                $branch->forceFill(['suspended_at' => now()])->save();

                foreach ($branch->users()->get() as $user) {
                    $user->tokens()->delete();
                }
            });
        }

        return response()->json(['data' => $this->present($branch, $this->stats())]);
    }

    public function resume(string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);

        if ($branch->isSuspended()) {
            $branch->forceFill(['suspended_at' => null])->save();
        }

        return response()->json(['data' => $this->present($branch, $this->stats())]);
    }

    /** The people who sign in to one bay. */
    public function users(string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);
        $lastSeen = $this->lastSeenByUser($branch->id);

        $users = $branch->users()
            ->orderByRaw("case when role = 'owner' then 0 else 1 end")
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => $this->presentPerson($user, $lastSeen->get($user->id)));

        return response()->json(['data' => $users]);
    }

    /** Give a bay a new owner or cashier. */
    public function storeUser(Request $request, string $id): JsonResponse
    {
        $branch = Branch::query()->findOrFail($id);

        $request->merge(['phone' => User::normalisePhone((string) $request->input('phone'))]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'min:7', 'max:20', Rule::unique('users', 'phone')],
            'pin' => ['required', 'digits:4'],
            'role' => ['required', Rule::in(UserRole::bayRoles())],
        ], [
            'phone.unique' => 'Someone already signs in with this phone number. Each person can belong to one bay.',
            'pin.digits' => 'The PIN must be 4 digits.',
        ]);

        $user = User::query()->create([
            'branch_id' => $branch->id,
            'name' => $data['name'],
            'phone' => $data['phone'],
            'pin_hash' => $data['pin'],
            'role' => $data['role'],
            'active' => true,
        ]);

        return response()->json(['data' => $this->presentPerson($user, null)], 201);
    }

    /**
     * Change someone's name or role, or turn them off or on. A new role or
     * being turned off signs them out of every device straight away.
     */
    public function updateUser(Request $request, string $id, string $userId): JsonResponse
    {
        $user = User::query()->where('branch_id', $id)->findOrFail($userId);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'role' => ['sometimes', 'required', Rule::in(UserRole::bayRoles())],
            'active' => ['sometimes', 'boolean'],
        ]);

        $user->update($data);

        if ($user->wasChanged(['role', 'active'])) {
            $user->tokens()->delete();
        }

        return response()->json(['data' => $this->presentPerson($user, $this->lastSeenByUser($id)->get($user->id))]);
    }

    /** A new PIN signs the person out everywhere, so only the new PIN works. */
    public function resetPin(Request $request, string $id, string $userId): JsonResponse
    {
        $user = User::query()->where('branch_id', $id)->findOrFail($userId);

        $data = $request->validate(['pin' => ['required', 'digits:4']], ['pin.digits' => 'The PIN must be 4 digits.']);

        $user->update(['pin_hash' => $data['pin']]);
        $user->tokens()->delete();

        return response()->json(['message' => "{$user->name} can now sign in with the new PIN."]);
    }

    private function uniqueName(?Branch $except = null): Unique
    {
        return Rule::unique('branches', 'name')->ignore($except?->id)->whereNull('deleted_at');
    }

    /**
     * @return array<string, mixed>
     */
    private function presentPerson(User $user, mixed $lastSeen): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
            'role' => $user->role->value,
            'active' => $user->active,
            'last_seen_at' => $this->iso($lastSeen),
        ];
    }

    /**
     * Figures for every bay at once, so the page costs a handful of queries
     * however many bays there are.
     *
     * @return array<string, Collection<string, mixed>>
     */
    private function stats(): array
    {
        $month = Sale::query()
            ->where('status', SaleStatus::Active)
            ->where('sold_at', '>=', now()->startOfMonth())
            ->groupBy('branch_id')
            ->selectRaw('branch_id, count(*) as sales_count, coalesce(sum(amount), 0) as sales_total')
            ->get()
            ->keyBy('branch_id');

        $lastSale = Sale::query()
            ->groupBy('branch_id')
            ->selectRaw('branch_id, max(sold_at) as last_sale_at')
            ->pluck('last_sale_at', 'branch_id');

        $staff = User::query()
            ->whereNotNull('branch_id')
            ->where('active', true)
            ->groupBy('branch_id')
            ->selectRaw('branch_id, count(*) as staff_count')
            ->pluck('staff_count', 'branch_id');

        $lastSeen = DB::table('personal_access_tokens')
            ->join('users', 'users.id', '=', 'personal_access_tokens.tokenable_id')
            ->where('personal_access_tokens.tokenable_type', User::class)
            ->whereNotNull('users.branch_id')
            ->groupBy('users.branch_id')
            ->selectRaw('users.branch_id, max(personal_access_tokens.last_used_at) as last_seen_at')
            ->pluck('last_seen_at', 'branch_id');

        $owners = User::query()
            ->where('role', UserRole::Owner)
            ->orderBy('created_at')
            ->get(['id', 'branch_id', 'name', 'phone', 'active'])
            ->groupBy('branch_id');

        return compact('month', 'lastSale', 'staff', 'lastSeen', 'owners');
    }

    /**
     * @param  array<string, Collection<string, mixed>>  $stats
     * @return array<string, mixed>
     */
    private function present(Branch $branch, array $stats): array
    {
        $month = $stats['month']->get($branch->id);

        return [
            'id' => $branch->id,
            'name' => $branch->name,
            'location' => $branch->location,
            'phone' => $branch->phone,
            'suspended_at' => $branch->suspended_at?->toIso8601String(),
            'created_at' => $branch->created_at?->toIso8601String(),
            'owners' => ($stats['owners']->get($branch->id) ?? collect())
                ->map(fn (User $owner) => ['id' => $owner->id, 'name' => $owner->name, 'phone' => $owner->phone, 'active' => $owner->active])
                ->values(),
            'staff_count' => (int) ($stats['staff']->get($branch->id) ?? 0),
            'month' => [
                'sales_count' => (int) ($month->sales_count ?? 0),
                'sales_total' => (int) ($month->sales_total ?? 0),
            ],
            'last_sale_at' => $this->iso($stats['lastSale']->get($branch->id)),
            'last_seen_at' => $this->iso($stats['lastSeen']->get($branch->id)),
        ];
    }

    /**
     * @return Collection<string, mixed>
     */
    private function lastSeenByUser(string $branchId): Collection
    {
        return DB::table('personal_access_tokens')
            ->join('users', 'users.id', '=', 'personal_access_tokens.tokenable_id')
            ->where('personal_access_tokens.tokenable_type', User::class)
            ->where('users.branch_id', $branchId)
            ->groupBy('users.id')
            ->selectRaw('users.id, max(personal_access_tokens.last_used_at) as last_seen_at')
            ->pluck('last_seen_at', 'id');
    }

    private function iso(mixed $value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }
}
