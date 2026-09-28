<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        // The shell is served by the app, but the test must not depend on a
        // compiled asset manifest being present in the checkout.
        $this->withoutVite();

        $response = $this->get('/');

        $response->assertStatus(200);
    }
}
