<?php

use App\Http\Controllers\Api\V1\AttachmentController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\FolderController;
use App\Http\Controllers\Api\V1\NoteController;
use App\Http\Controllers\Api\V1\PreferencesController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\TrashController;
use App\Http\Controllers\Api\V1\VaultController;
use App\Http\Controllers\Api\V1\WorkspaceController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::middleware('throttle:6,1')->group(function (): void {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login']);
    });

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me']);

        Route::get('preferences', [PreferencesController::class, 'show']);
        Route::put('preferences', [PreferencesController::class, 'update']);

        // Flat reorder endpoints sit above the parameterised routes so that
        // "reorder" is never read as a workspace id.
        Route::post('workspaces/reorder', [WorkspaceController::class, 'reorder']);
        Route::post('folders/reorder', [FolderController::class, 'reorder']);
        Route::post('notes/reorder', [NoteController::class, 'reorder']);
        Route::post('attachments/reorder', [AttachmentController::class, 'reorder']);
        Route::post('tasks/reorder', [TaskController::class, 'reorder']);

        Route::get('workspaces', [WorkspaceController::class, 'index']);
        Route::post('workspaces', [WorkspaceController::class, 'store']);
        Route::get('workspaces/{workspace}', [WorkspaceController::class, 'show']);
        Route::patch('workspaces/{workspace}', [WorkspaceController::class, 'update']);
        Route::put('workspaces/{workspace}', [WorkspaceController::class, 'update']);
        Route::delete('workspaces/{workspace}', [WorkspaceController::class, 'destroy']);
        Route::get('workspaces/{workspace}/stats', [WorkspaceController::class, 'stats']);

        Route::get('workspaces/{workspace}/folders', [FolderController::class, 'index']);
        Route::post('workspaces/{workspace}/folders', [FolderController::class, 'store']);

        Route::get('folders/{folder}', [FolderController::class, 'show']);
        Route::patch('folders/{folder}', [FolderController::class, 'update']);
        Route::delete('folders/{folder}', [FolderController::class, 'destroy']);
        Route::post('folders/{folderTrashed}/restore', [FolderController::class, 'restore']);
        Route::delete('folders/{folderTrashed}/force', [FolderController::class, 'forceDelete']);

        Route::get('workspaces/{workspace}/notes', [NoteController::class, 'index']);
        Route::post('workspaces/{workspace}/notes', [NoteController::class, 'store']);

        Route::get('notes/{note}', [NoteController::class, 'show']);
        Route::patch('notes/{note}', [NoteController::class, 'update']);
        Route::delete('notes/{note}', [NoteController::class, 'destroy']);
        Route::post('notes/{noteTrashed}/restore', [NoteController::class, 'restore']);
        Route::delete('notes/{noteTrashed}/force', [NoteController::class, 'forceDelete']);

        Route::get('workspaces/{workspace}/attachments', [AttachmentController::class, 'index']);
        Route::post('workspaces/{workspace}/attachments', [AttachmentController::class, 'store']);

        Route::get('attachments/{attachment}', [AttachmentController::class, 'show']);
        Route::get('attachments/{attachment}/download', [AttachmentController::class, 'download']);
        Route::get('attachments/{attachment}/preview', [AttachmentController::class, 'preview']);
        Route::patch('attachments/{attachment}', [AttachmentController::class, 'update']);
        Route::delete('attachments/{attachment}', [AttachmentController::class, 'destroy']);
        Route::post('attachments/{attachmentTrashed}/restore', [AttachmentController::class, 'restore']);
        Route::delete('attachments/{attachmentTrashed}/force', [AttachmentController::class, 'forceDelete']);

        Route::get('workspaces/{workspace}/tasks', [TaskController::class, 'index']);
        Route::post('workspaces/{workspace}/tasks', [TaskController::class, 'store']);

        Route::get('tasks/{task}', [TaskController::class, 'show']);
        Route::patch('tasks/{task}', [TaskController::class, 'update']);
        Route::delete('tasks/{task}', [TaskController::class, 'destroy']);

        Route::get('workspaces/{workspace}/trash', [TrashController::class, 'index']);
        Route::post('workspaces/{workspace}/trash/restore', [TrashController::class, 'restore']);
        Route::delete('workspaces/{workspace}/trash', [TrashController::class, 'purge']);
        Route::delete('workspaces/{workspace}/trash/{type}/{id}', [TrashController::class, 'purgeOne'])
            ->whereIn('type', ['folder', 'note', 'attachment']);

        Route::get('vault', [VaultController::class, 'show']);
        Route::put('vault', [VaultController::class, 'store']);
        Route::post('vault', [VaultController::class, 'store']);
        Route::delete('vault', [VaultController::class, 'destroy']);
    });
});
