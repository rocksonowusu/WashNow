<?php

namespace App\Sync;

use Illuminate\Database\Eloquent\Model;
use RuntimeException;

/**
 * Thrown by a sync handler when one pushed item cannot be applied. The other
 * items in the batch carry on.
 *
 * Reasons: forbidden, stale, voided, deleted, duplicate_plate, unknown_table,
 * unknown_op. (invalid and day_closed come from validation errors.)
 */
class Rejection extends RuntimeException
{
    public function __construct(
        public readonly string $reason,
        string $message,
        /** The server's copy, so the device can replace its own. */
        public readonly ?Model $serverRecord = null,
    ) {
        parent::__construct($message);
    }
}
