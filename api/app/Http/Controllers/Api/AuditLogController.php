<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Newest first. Optional filters: ?table_name=sales&record_id=<uuid>.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'table_name' => ['nullable', 'string', 'max:50'],
            'record_id' => ['nullable', 'uuid'],
        ]);

        $logs = AuditLog::query()
            ->where('branch_id', $request->user()->branch_id)
            ->when($filters['table_name'] ?? null, fn ($query, $table) => $query->where('table_name', $table))
            ->when($filters['record_id'] ?? null, fn ($query, $id) => $query->where('record_id', $id))
            ->with('user:id,name')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(50);

        return response()->json($logs);
    }
}
