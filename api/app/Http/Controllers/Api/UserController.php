<?php

namespace App\Http\Controllers\Api;

use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Owner-only management of the people who can sign in.
 */
class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $users = User::query()
            ->where('branch_id', $request->user()->branch_id)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => UserResource::collection($users)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $user = User::query()->create([
            'branch_id' => $request->user()->branch_id,
            'name' => $data['name'],
            'phone' => $data['phone'],
            'pin_hash' => $data['pin'],
            'role' => $data['role'],
            'active' => $data['active'] ?? true,
        ]);

        return response()->json(['data' => new UserResource($user)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $user = User::query()
            ->where('branch_id', $request->user()->branch_id)
            ->findOrFail($id);

        $data = $this->validated($request, $user);

        // Stop an owner locking themselves out of their own bay.
        if ($user->is($request->user())) {
            if (array_key_exists('active', $data) && ! $request->boolean('active')) {
                throw ValidationException::withMessages(['active' => ['You cannot turn off your own account.']]);
            }

            if (isset($data['role']) && $data['role'] !== UserRole::Owner->value) {
                throw ValidationException::withMessages(['role' => ['You cannot remove your own owner role.']]);
            }
        }

        if (array_key_exists('pin', $data)) {
            $data['pin_hash'] = $data['pin'];
            unset($data['pin']);
        }

        $user->update($data);

        // A new PIN, a new role or being turned off signs the person out of
        // every device, so the old access stops straight away.
        if ($user->wasChanged(['pin_hash', 'role', 'active']) && ! $user->is($request->user())) {
            $user->tokens()->delete();
        }

        return response()->json(['data' => new UserResource($user)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?User $user = null): array
    {
        if ($request->has('phone')) {
            $request->merge(['phone' => User::normalisePhone((string) $request->input('phone'))]);
        }

        $presence = $user ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$presence, 'string', 'max:100'],
            'phone' => [$presence, 'string', 'min:7', 'max:20', Rule::unique('users')->ignore($user?->id)],
            'pin' => [$presence, 'digits:4'],
            'role' => [$presence, Rule::enum(UserRole::class)],
            'active' => ['sometimes', 'boolean'],
        ], [
            'phone.unique' => 'Another user already signs in with this phone number.',
        ]);
    }
}
