<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            // The rate a new crew member starts on when a cashier adds them
            // while recording a sale. Empty until the owner sets it.
            $table->decimal('default_commission_percent', 5, 2)->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('default_commission_percent');
        });
    }
};
