<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // A browser request from the same origin SPA always carries an Origin
        // and a Referer header, and Sanctum applies its cookie, session and
        // CSRF stack only to those requests. Sending them here keeps the suite
        // on the path a real client uses, instead of a session-less path that
        // no browser ever takes.
        $origin = rtrim((string) config('app.url'), '/');

        $this->withHeaders([
            'Origin' => $origin,
            'Referer' => $origin.'/',
        ]);
    }
}
