<?php

namespace App\Services;

use App\Models\User;
use App\Models\Washer;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * The crew are the people who wash the vehicles (the `washers` table).
 *
 * Anyone signed in can add a crew member, because a new person may turn up
 * while a sale is being recorded. Only the owner decides what they are paid:
 * a cashier's addition always starts on the bay's standard rate, and only the
 * owner can change a rate, rename or remove someone.
 */
class CrewService
{
    /**
     * @param  array<string, mixed>  $input
     *
     * @throws ValidationException
     */
    public function create(User $user, array $input, ?string $id = null): Washer
    {
        $data = Validator::make($input, [
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'commission_percent' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
        ])->validate();

        $name = self::cleanName($data['name']);

        if ($name === '') {
            throw ValidationException::withMessages(['name' => ['Enter the person\'s name.']]);
        }

        if ($this->findByName($user->branch_id, $name)) {
            throw ValidationException::withMessages(['name' => ["{$name} is already on the crew list."]]);
        }

        $standard = $user->branch->default_commission_percent;
        $percent = $user->isOwner() ? ($data['commission_percent'] ?? $standard) : $standard;

        if ($percent === null) {
            throw ValidationException::withMessages(['commission_percent' => [
                $user->isOwner()
                    ? 'Enter this person\'s commission, or set a standard commission for new crew.'
                    : 'The owner needs to set the standard commission before new crew can be added.',
            ]]);
        }

        $washer = new Washer([
            'branch_id' => $user->branch_id,
            'name' => $name,
            'phone' => $data['phone'] ?? null,
            'commission_percent' => $percent,
            'active' => true,
        ]);

        if ($id !== null) {
            $washer->id = $id;
        }

        $washer->save();

        return $washer->refresh();
    }

    /**
     * Names match whatever the capitals or spacing: "yaw  mensah" is "Yaw Mensah".
     */
    public function findByName(string $branchId, string $name, ?string $exceptId = null): ?Washer
    {
        return Washer::query()
            ->where('branch_id', $branchId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(self::cleanName($name))])
            ->when($exceptId, fn ($query) => $query->whereKeyNot($exceptId))
            ->first();
    }

    public static function cleanName(string $name): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $name));
    }
}
