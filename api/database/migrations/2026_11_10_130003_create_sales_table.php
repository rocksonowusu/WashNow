<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('branch_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('category_id')->constrained('vehicle_categories')->restrictOnDelete();
            $table->foreignUuid('customer_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('plate_number', 20)->nullable();
            $table->string('service_note')->nullable();
            $table->unsignedInteger('amount'); // pesewas
            $table->string('payment_method', 10); // cash | momo
            $table->foreignUuid('recorded_by')->constrained('users')->restrictOnDelete();
            $table->dateTime('sold_at');
            $table->string('status', 10)->default('active'); // active | voided
            $table->string('void_reason')->nullable();
            $table->string('override_reason')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['branch_id', 'sold_at']);
            $table->index(['branch_id', 'updated_at']);
            $table->index(['branch_id', 'plate_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
