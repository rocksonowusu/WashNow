<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Use after auth:sanctum, e.g. ->middleware('role:owner') or
 * ->middleware('role:owner,cashier').
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_if($user === null, 401, 'Unauthenticated.');
        abort_unless($user->active, 403, 'This account has been turned off.');
        abort_unless(in_array($user->role->value, $roles, true), 403, 'You are not allowed to do this.');

        return $next($request);
    }
}
