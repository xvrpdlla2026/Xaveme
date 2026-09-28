<?php

use Illuminate\Support\Facades\Route;

// The React app owns every non-API path, so deep links resolve to the same shell.
Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|sanctum|up|build|storage).*$');
