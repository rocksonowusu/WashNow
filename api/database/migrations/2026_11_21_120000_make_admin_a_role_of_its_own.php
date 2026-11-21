<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The WashNow admin is no longer an owner of a bay with extra rights: it is a
 * role of its own ("admin") that belongs to no bay. So users.branch_id may be
 * empty (only for admins), and whoever had is_admin becomes an admin and
 * leaves their bay. Their bay and its records stay; the admin can give it a
 * new owner. The is_admin column goes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('branch_id')->nullable()->change();
        });

        DB::table('users')->where('is_admin', true)->update([
            'role' => 'admin',
            'branch_id' => null,
            'updated_at' => now(),
        ]);

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_admin');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_admin')->default(false)->after('active');
        });

        // Admins have no bay to go back to, so they are left as they are; give
        // them a bay by hand before making branch_id required again.
        DB::table('users')->where('role', 'admin')->update(['is_admin' => true]);
    }
};
