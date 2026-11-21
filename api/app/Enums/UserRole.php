<?php

namespace App\Enums;

enum UserRole: string
{
    case Owner = 'owner';
    case Cashier = 'cashier';

    /**
     * Runs WashNow itself: manages every washing bay and sees their figures,
     * but belongs to no bay and can't record sales.
     */
    case Admin = 'admin';

    /** The roles a person inside a washing bay can have. */
    public static function bayRoles(): array
    {
        return [self::Owner->value, self::Cashier->value];
    }
}
