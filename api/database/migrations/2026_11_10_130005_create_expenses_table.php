<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('branch_id')->constrained()->restrictOnDelete();
            $table->string('category', 20); // soap | water | fuel | electricity | other
            $table->unsignedInteger('amount'); // pesewas
            $table->string('payment_method', 10); // cash | momo
            $table->string('note')->nullable();
            $table->dateTime('spent_at');
            $table->foreignUuid('recorded_by')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['branch_id', 'spent_at']);
            $table->index(['branch_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
