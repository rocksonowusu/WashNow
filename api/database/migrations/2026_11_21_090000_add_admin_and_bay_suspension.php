<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Running more than one washing bay:
 *
 * - users.is_admin marks the person who runs WashNow itself. They stay an
 *   ordinary member of their own bay, and can also create and manage bays.
 *   Only `php artisan washnow:admin` sets it.
 * - branches.suspended_at stops a whole bay signing in, without removing any
 *   of its records.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('active');
        });

        Schema::table('branches', function (Blueprint $table) {
            $table->timestamp('suspended_at')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_admin');
        });

        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('suspended_at');
        });
    }
};
