<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            // A cashier cannot void a sale, only ask. These hold the request
            // until the owner approves it (the sale is voided) or declines it
            // (they are cleared). They are kept after a void, as a record of
            // who asked and why.
            $table->foreignUuid('void_requested_by')->nullable()->after('override_reason')
                ->constrained('users')->restrictOnDelete();
            $table->string('void_request_reason')->nullable()->after('void_requested_by');
            $table->dateTime('void_requested_at')->nullable()->after('void_request_reason');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('void_requested_by');
            $table->dropColumn(['void_request_reason', 'void_requested_at']);
        });
    }
};
