<?php

namespace App\Exceptions;

use Illuminate\Validation\ValidationException;

/**
 * A record is dated inside a day the owner has closed. It behaves like any
 * other validation error over the API; sync reports it as "day_closed".
 */
class DayClosedException extends ValidationException {}
