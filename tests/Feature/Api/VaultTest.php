<?php

namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\Vault;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VaultTest extends TestCase
{
    use RefreshDatabase;

    private function payload(): array
    {
        return [
            'salt' => base64_encode(random_bytes(16)),
            'iterations' => 250000,
            'check_iv' => base64_encode(random_bytes(12)),
            'check_ct' => base64_encode(random_bytes(32)),
        ];
    }

    public function test_show_reports_an_unconfigured_vault(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/v1/vault')
            ->assertOk()
            ->assertJsonPath('data.configured', false)
            ->assertJsonPath('data.salt', null);
    }

    public function test_store_then_show_round_trips_the_parameters(): void
    {
        $user = User::factory()->create();
        $payload = $this->payload();

        $this->actingAs($user)->putJson('/api/v1/vault', $payload)
            ->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.iterations', 250000)
            ->assertJsonPath('data.salt', $payload['salt']);

        $this->assertDatabaseHas('vaults', [
            'user_id' => $user->getKey(),
            'salt' => $payload['salt'],
        ]);

        $this->actingAs($user)->getJson('/api/v1/vault')
            ->assertOk()
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.check_ct', $payload['check_ct']);
    }

    public function test_store_keeps_one_row_per_user(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/v1/vault', $this->payload())->assertOk();
        $second = $this->payload();
        $this->actingAs($user)->putJson('/api/v1/vault', $second)->assertOk();

        $this->assertSame(1, Vault::where('user_id', $user->getKey())->count());
        $this->assertSame($second['salt'], Vault::where('user_id', $user->getKey())->first()->salt);
    }

    public function test_store_validates_the_payload(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/v1/vault', ['iterations' => 10])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['salt', 'check_iv', 'check_ct', 'iterations']);
    }

    public function test_delete_removes_the_vault_row(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->putJson('/api/v1/vault', $this->payload())->assertOk();

        $this->actingAs($user)->deleteJson('/api/v1/vault')->assertOk();

        $this->assertSame(0, Vault::where('user_id', $user->getKey())->count());

        $this->actingAs($user)->getJson('/api/v1/vault')
            ->assertOk()
            ->assertJsonPath('data.configured', false);
    }
}
