<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Server-side history: rows are only ever added, never edited, deleted
        // or synced from devices, so there is no version or soft delete here.
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('branch_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('user_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('action', 30);
            $table->string('table_name', 50);
            $table->uuid('record_id');
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->dateTime('created_at');

            $table->index(['table_name', 'record_id']);
            $table->index(['branch_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
