<?php

namespace App\Providers;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\DayClosing;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SaleWasher;
use App\Models\User;
use App\Models\VehicleCategory;
use App\Models\Washer;
use App\Observers\AuditObserver;
use App\Sync\IdAliases;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /** Every model whose changes are written to the audit log. */
    private const AUDITED = [
        Branch::class,
        User::class,
        VehicleCategory::class,
        Washer::class,
        Customer::class,
        Sale::class,
        SaleWasher::class,
        Expense::class,
        DayClosing::class,
    ];

    public function register(): void
    {
        // One shared instance per request, so every sync handler sees the
        // same aliases while a batch is processed.
        $this->app->scoped(IdAliases::class);
    }

    public function boot(): void
    {
        foreach (self::AUDITED as $model) {
            $model::observe(AuditObserver::class);
        }
    }
}
