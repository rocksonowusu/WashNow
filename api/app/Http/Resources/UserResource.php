<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    private bool $withAdminFlag = false;

    /** Include is_admin. Only for the person's own account. */
    public function forSelf(): static
    {
        $this->withAdminFlag = true;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'phone' => $this->phone,
            'role' => $this->role->value,
            'active' => $this->active,
            // Only sent to the person themselves (sign-in and /auth/me).
            'is_admin' => $this->when($this->withAdminFlag, fn () => (bool) $this->is_admin),
            'branch_id' => $this->branch_id,
            'branch' => $this->whenLoaded('branch', fn () => [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
            ]),
        ];
    }
}
