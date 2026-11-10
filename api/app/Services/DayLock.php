<?php

namespace App\Services;

use App\Exceptions\DayClosedException;
use App\Models\DayClosing;
use Carbon\CarbonInterface;

/**
 * Once the owner closes a day, nothing dated inside it may be added or changed.
 */
final class DayLock
{
    public static function isClosed(string $branchId, CarbonInterface|string $date): bool
    {
        return DayClosing::query()
            ->where('branch_id', $branchId)
            ->whereDate('date', self::dateString($date))
            ->exists();
    }

    /**
     * @throws DayClosedException
     */
    public static function ensureOpen(string $branchId, CarbonInterface|string $date, string $field): void
    {
        if (self::isClosed($branchId, $date)) {
            throw DayClosedException::withMessages([
                $field => [self::dateString($date).' has been closed, so its records can no longer be changed.'],
            ]);
        }
    }

    private static function dateString(CarbonInterface|string $date): string
    {
        return is_string($date)
            ? $date
            : $date->copy()->setTimezone(config('app.timezone'))->toDateString();
    }
}
