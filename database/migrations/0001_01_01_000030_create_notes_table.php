<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->ulid('folder_id')->nullable();
            $table->string('title')->default('');
            $table->longText('content')->nullable();
            $table->boolean('encrypted')->default(false);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['workspace_id', 'deleted_at']);
            $table->index(['workspace_id', 'folder_id', 'position']);
            $table->index(['folder_id', 'position']);
            $table->index('deleted_at');

            $table->foreign('folder_id')->references('id')->on('folders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
