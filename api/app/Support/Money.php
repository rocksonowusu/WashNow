<?php

namespace App\Support;

final class Money
{
    /**
     * 1500 pesewas becomes "GH₵15.00".
     */
    public static function format(int $pesewas): string
    {
        return 'GH₵'.number_format($pesewas / 100, 2);
    }
}
