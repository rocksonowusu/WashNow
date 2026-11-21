<?php

use Illuminate\Support\Facades\Route;

// api.<domain> has no web pages; the app itself lives on Cloudflare Pages.
// This only answers a visit to the bare address, so it is clear the server is up.
Route::get('/', fn () => response()->json([
    'name' => 'WashNow API',
    'health' => url('/api/health'),
]));
