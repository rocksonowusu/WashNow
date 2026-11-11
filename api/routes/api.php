<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DayClosingController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\VehicleCategoryController;
use App\Http\Controllers\Api\WasherController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
    });
});

// Everything below needs a signed-in, active user and is limited to that
// user's branch inside each controller.
Route::middleware(['auth:sanctum', 'role:owner,cashier'])->group(function () {

    // Cashier and owner: the day-to-day work.
    Route::get('/categories', [VehicleCategoryController::class, 'index']);
    Route::get('/branch', [BranchController::class, 'show']);

    // The crew (washers). Anyone can add a person; the owner sets their pay.
    Route::get('/washers', [WasherController::class, 'index']);
    Route::post('/washers', [WasherController::class, 'store']);

    Route::get('/customers', [CustomerController::class, 'index']);
    Route::post('/customers', [CustomerController::class, 'store']);
    Route::get('/customers/{id}', [CustomerController::class, 'show']);
    Route::put('/customers/{id}', [CustomerController::class, 'update']);

    Route::get('/sales', [SaleController::class, 'index']);
    Route::post('/sales', [SaleController::class, 'store']);
    Route::get('/sales/{id}', [SaleController::class, 'show']);
    Route::post('/sales/{id}/void-request', [SaleController::class, 'requestVoid']);

    Route::get('/expenses', [ExpenseController::class, 'index']);
    Route::post('/expenses', [ExpenseController::class, 'store']);

    // Offline devices: send the outbox, then fetch what changed.
    Route::post('/sync/push', [SyncController::class, 'push']);
    Route::get('/sync/pull', [SyncController::class, 'pull']);

    // Owner only: settings, corrections, money totals and history.
    Route::middleware('role:owner')->group(function () {
        Route::post('/categories', [VehicleCategoryController::class, 'store']);
        Route::put('/categories/{id}', [VehicleCategoryController::class, 'update']);
        Route::delete('/categories/{id}', [VehicleCategoryController::class, 'destroy']);

        Route::put('/branch', [BranchController::class, 'update']);

        Route::put('/washers/{id}', [WasherController::class, 'update']);
        Route::delete('/washers/{id}', [WasherController::class, 'destroy']);

        Route::delete('/customers/{id}', [CustomerController::class, 'destroy']);

        Route::put('/sales/{id}', [SaleController::class, 'update']);
        Route::post('/sales/{id}/void', [SaleController::class, 'void']);
        Route::delete('/sales/{id}/void-request', [SaleController::class, 'declineVoid']);

        Route::put('/expenses/{id}', [ExpenseController::class, 'update']);
        Route::delete('/expenses/{id}', [ExpenseController::class, 'destroy']);

        Route::get('/day-summary', [DayClosingController::class, 'summary']);
        Route::get('/day-closings', [DayClosingController::class, 'index']);
        Route::post('/day-closings', [DayClosingController::class, 'store']);

        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::put('/users/{id}', [UserController::class, 'update']);

        Route::get('/audit-logs', [AuditLogController::class, 'index']);
    });
});
