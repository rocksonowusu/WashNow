<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Use after auth:sanctum: only the person who runs WashNow itself
 * (users.is_admin) may manage washing bays.
 */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        abort_if($user === null, 401, 'Unauthenticated.');
        abort_unless($user->isAdmin(), 403, 'Only the WashNow admin can do this.');

        return $next($request);
    }
}
