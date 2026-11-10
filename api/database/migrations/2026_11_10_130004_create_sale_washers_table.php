<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_washers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('branch_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('sale_id')->constrained()->restrictOnDelete();
            $table->foreignUuid('washer_id')->constrained()->restrictOnDelete();
            // Snapshots taken when the sale is recorded. Later changes to the
            // washer's percentage never rewrite these.
            $table->decimal('commission_percent', 5, 2);
            $table->unsignedInteger('commission_amount'); // pesewas
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['sale_id', 'washer_id']);
            $table->index(['branch_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_washers');
    }
};
