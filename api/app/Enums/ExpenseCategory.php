<?php

namespace App\Enums;

enum ExpenseCategory: string
{
    case Soap = 'soap';
    case Water = 'water';
    case Fuel = 'fuel';
    case Electricity = 'electricity';
    case Other = 'other';
}
