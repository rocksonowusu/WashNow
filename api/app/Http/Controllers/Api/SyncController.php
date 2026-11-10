<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Sync\PullService;
use App\Sync\PushProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class SyncController extends Controller
{
    /**
     * Body: {"items": [{"op": "upsert"|"delete", "table": "sales", "record": {"id": "...", ...}}]}
     * At most 50 items. Returns the accepted ids and, for each rejected item,
     * the reason and (where useful) the server's copy of the record.
     */
    public function push(Request $request, PushProcessor $processor): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.op' => ['required', 'string'],
            'items.*.table' => ['required', 'string'],
            'items.*.record' => ['required', 'array'],
            'items.*.record.id' => ['required', 'uuid'],
            'items.*.record.version' => ['sometimes', 'integer', 'min:1'],
        ], [
            'items.max' => 'Send at most 50 records at a time.',
        ]);

        // Use the raw items: validation above only checks the envelope, and
        // each handler validates its own record fields.
        $items = array_values($request->input('items'));

        return response()->json($processor->process($request->user(), $items));
    }

    /**
     * ?since=<cursor from the last pull>. Leave it out for a first, full pull.
     */
    public function pull(Request $request, PullService $pull): JsonResponse
    {
        $data = $request->validate(['since' => ['nullable', 'date']]);

        $since = isset($data['since'])
            ? Carbon::parse($data['since'])->setTimezone(config('app.timezone'))
            : null;

        return response()->json($pull->changes($request->user(), $since));
    }
}
