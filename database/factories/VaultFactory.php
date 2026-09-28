<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\Vault;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Vault>
 */
class VaultFactory extends Factory
{
    protected $model = Vault::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'salt' => base64_encode(random_bytes(16)),
            'iterations' => 250000,
            'check_iv' => base64_encode(random_bytes(12)),
            'check_ct' => base64_encode(Str::random(32)),
        ];
    }
}
