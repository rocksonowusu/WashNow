<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * A 4-digit PIN has only 10,000 combinations, so wrong guesses are limited
     * twice: per phone from one address, and per phone from anywhere.
     */
    private const MAX_ATTEMPTS_PER_ADDRESS = 5;

    private const ADDRESS_LOCK_SECONDS = 15 * 60;

    private const MAX_ATTEMPTS_PER_PHONE = 20;

    private const PHONE_LOCK_SECONDS = 60 * 60;

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'pin' => ['required', 'digits:4'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $phone = User::normalisePhone($data['phone']);
        $addressKey = 'login:'.$phone.'|'.$request->ip();
        $phoneKey = 'login:'.$phone;

        foreach ([[$addressKey, self::MAX_ATTEMPTS_PER_ADDRESS], [$phoneKey, self::MAX_ATTEMPTS_PER_PHONE]] as [$key, $max]) {
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $minutes = (int) ceil(RateLimiter::availableIn($key) / 60);

                throw ValidationException::withMessages([
                    'phone' => ["Too many wrong attempts. Try again in {$minutes} minute(s)."],
                ])->status(429);
            }
        }

        $user = User::query()->where('phone', $phone)->first();

        if (! $user || ! $user->active || ! Hash::check($data['pin'], $user->pin_hash)) {
            RateLimiter::hit($addressKey, self::ADDRESS_LOCK_SECONDS);
            RateLimiter::hit($phoneKey, self::PHONE_LOCK_SECONDS);

            // One message for every failure, so it never reveals which phone
            // numbers have accounts.
            throw ValidationException::withMessages([
                'phone' => ['The phone number or PIN is incorrect.'],
            ]);
        }

        RateLimiter::clear($addressKey);

        $token = $user->createToken($data['device_name'] ?? 'device')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new UserResource($user->load('branch')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        // Only this device's token; other devices stay signed in.
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => new UserResource($request->user()->load('branch')),
        ]);
    }
}
