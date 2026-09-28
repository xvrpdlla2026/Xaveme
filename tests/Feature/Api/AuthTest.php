<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_guest_can_register_and_is_signed_in(): void
    {
        $response = $this->postJson('/api/v1/register', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'correct-horse-battery',
            'password_confirmation' => 'correct-horse-battery',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.email', 'ada@example.com')
            ->assertJsonPath('data.name', 'Ada Lovelace');

        $this->assertIsString($response->json('data.id'));
        $this->assertSame(26, strlen((string) $response->json('data.id')));
        $this->assertArrayNotHasKey('password', $response->json('data'));

        $this->assertDatabaseHas('users', ['email' => 'ada@example.com']);
        $this->assertAuthenticated();

        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.email', 'ada@example.com');
    }

    public function test_registration_rejects_a_duplicate_email(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $this->postJson('/api/v1/register', [
            'name' => 'Ada',
            'email' => 'taken@example.com',
            'password' => 'correct-horse-battery',
            'password_confirmation' => 'correct-horse-battery',
        ])->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_login_accepts_valid_credentials_and_returns_the_user(): void
    {
        $user = User::factory()->create([
            'email' => 'grace@example.com',
            'password' => Hash::make('hopper-1906'),
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'grace@example.com',
            'password' => 'hopper-1906',
        ])->assertOk()->assertJsonPath('data.id', $user->getKey());

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_rejects_a_bad_password(): void
    {
        User::factory()->create([
            'email' => 'grace@example.com',
            'password' => Hash::make('hopper-1906'),
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'grace@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/v1/me')->assertStatus(401)->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_logout_destroys_the_session(): void
    {
        User::factory()->create([
            'email' => 'grace@example.com',
            'password' => Hash::make('hopper-1906'),
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'grace@example.com',
            'password' => 'hopper-1906',
        ])->assertOk();

        $this->getJson('/api/v1/me')->assertOk();

        $this->postJson('/api/v1/logout')->assertOk();

        // The same PHP process keeps the resolved guard alive between requests in
        // a test, so drop it and let the next request read the real session.
        \Illuminate\Support\Facades\Auth::forgetGuards();

        $this->getJson('/api/v1/me')->assertStatus(401);
    }

    public function test_preferences_are_returned_and_updated(): void
    {
        $user = User::factory()->create(['preferences' => null]);

        $this->actingAs($user)->getJson('/api/v1/preferences')
            ->assertOk()
            ->assertJsonPath('data.preferences', []);

        $this->actingAs($user)->putJson('/api/v1/preferences', [
            'theme' => 'dark',
            'palette' => 'teal',
        ])->assertOk()
            ->assertJsonPath('data.preferences.theme', 'dark')
            ->assertJsonPath('data.preferences.palette', 'teal');

        $this->assertSame(['theme' => 'dark', 'palette' => 'teal'], $user->refresh()->preferences);

        $this->actingAs($user)->getJson('/api/v1/preferences')
            ->assertOk()
            ->assertJsonPath('data.preferences.theme', 'dark');
    }

    public function test_preferences_reject_an_unknown_palette(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/v1/preferences', ['palette' => 'neon'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('palette');
    }

    public function test_login_is_throttled_after_six_attempts(): void
    {
        User::factory()->create(['email' => 'grace@example.com']);

        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/v1/login', [
                'email' => 'grace@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/login', [
            'email' => 'grace@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }
}