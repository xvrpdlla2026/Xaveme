<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaults', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->string('salt');
            $table->unsignedInteger('iterations');
            $table->text('check_iv');
            $table->text('check_ct');
            $table->timestamps();

            // At most one vault row per user.
            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vaults');
    }
};
