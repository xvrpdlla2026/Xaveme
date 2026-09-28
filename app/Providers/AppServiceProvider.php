<?php

namespace App\Providers;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Workspace;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Explicit bindings rather than implicit ones: several controller
        // actions read the request instead of the model, and every route
        // parameter still has to arrive as a model.
        //
        // The plain bindings hide soft deleted rows, so a soft deleted row is a
        // 404 on the normal routes. The *Trashed bindings only find soft deleted
        // rows and back the restore and force delete routes.
        Route::bind('workspace', fn (string $value) => Workspace::query()->findOrFail($value));
        Route::bind('folder', fn (string $value) => Folder::query()->findOrFail($value));
        Route::bind('note', fn (string $value) => Note::query()->findOrFail($value));
        Route::bind('attachment', fn (string $value) => Attachment::query()->findOrFail($value));

        Route::bind('folderTrashed', fn (string $value) => Folder::onlyTrashed()->findOrFail($value));
        Route::bind('noteTrashed', fn (string $value) => Note::onlyTrashed()->findOrFail($value));
        Route::bind('attachmentTrashed', fn (string $value) => Attachment::onlyTrashed()->findOrFail($value));
    }
}
