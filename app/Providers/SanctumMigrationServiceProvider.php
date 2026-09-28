<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class SanctumMigrationServiceProvider extends ServiceProvider
{
    /**
     * Sanctum ships its migrations inside the package. Register them from the
     * vendor directory so the personal_access_tokens table exists for the
     * ULID retarget migration that follows it.
     */
    public function boot(): void
    {
        $path = base_path('vendor/laravel/sanctum/database/migrations');

        if (is_dir($path)) {
            $this->loadMigrationsFrom($path);
        }
    }
}
