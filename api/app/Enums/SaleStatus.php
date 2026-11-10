<?php

namespace App\Enums;

enum SaleStatus: string
{
    case Active = 'active';
    case Voided = 'voided';
}
