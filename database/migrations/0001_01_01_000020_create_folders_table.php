<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('folders', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->ulid('parent_id')->nullable();
            $table->string('name');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['workspace_id', 'parent_id', 'position']);
            $table->index('deleted_at');
            $table->index('parent_id');

            $table->foreign('parent_id')->references('id')->on('folders')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('folders');
    }
};
