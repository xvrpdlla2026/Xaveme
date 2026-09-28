<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Cookie based Sanctum auth for the same origin SPA. statefulApi()
        // puts EnsureFrontendRequestsAreStateful at the front of the api group
        // and that middleware injects the cookie, session and CSRF stack
        // itself for a stateful request. The api group must not be restated
        // with those same middleware: they would then run twice, so an
        // incoming session cookie is decrypted a second time, the session is
        // re-initialised and the response carries a fresh empty session. Route
        // model binding needs no group edit either, because the default group
        // already ends with SubstituteBindings and AppServiceProvider binds the
        // route parameters explicitly.
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The frontend always sends Accept: application/json, so a stray HTML
        // error page must never be returned for an API path.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson()
        );
    })->create();
