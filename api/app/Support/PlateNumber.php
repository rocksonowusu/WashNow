<?php

namespace App\Support;

final class PlateNumber
{
    /**
     * "gr 1234-21" and "GR-1234 21" must find the same customer, so plates are
     * stored as capital letters and digits only: "GR123421".
     */
    public static function normalise(?string $plate): ?string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $plate) ?? '');

        return $clean === '' ? null : $clean;
    }
}
