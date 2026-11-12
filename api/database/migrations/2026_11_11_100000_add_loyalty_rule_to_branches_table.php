<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            // "Every Nth wash is a loyalty wash." Empty means no loyalty rule.
            // The app only reminds the cashier; the owner decides the reward.
            $table->unsignedSmallInteger('loyalty_every_visits')->nullable()->after('default_commission_percent');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('loyalty_every_visits');
        });
    }
};
