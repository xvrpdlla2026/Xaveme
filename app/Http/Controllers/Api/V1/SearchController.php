<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Search\IndexSearchRequest;
use App\Models\Attachment;
use App\Models\Note;
use App\Models\Workspace;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

/**
 * One search across every workspace the account owns.
 *
 * The tree is scoped to the open workspace, but a search is not: a note kept in
 * another workspace is exactly the thing a search is for, and a hit the reader
 * could not open would be an answer they cannot use. So every row carries the
 * workspace it lives in, and the page switches to that workspace to open one.
 *
 * Note bodies are stored as the reader wrote them, so a sealed body is ciphertext
 * here and cannot be matched: a title or a file name is still found, and the page
 * says which of the two it matched.
 */
class SearchController extends Controller
{
    /** How many of each kind one search returns. */
    private const LIMIT = 100;

    public function index(IndexSearchRequest $request): JsonResponse
    {
        $term = trim((string) $request->input('q'));
        $escaped = strtolower(LikePattern::escape($term));

        // Only the workspaces this account owns, and only their names: a search
        // never reaches another user's rows, and the name is the whole of what a
        // hit needs to say about where it came from.
        $workspaces = Workspace::query()
            ->where('user_id', $request->user()->getKey())
            ->pluck('name', 'id');

        $notes = Note::query()
            ->whereIn('workspace_id', $workspaces->keys())
            ->where(function (Builder $query) use ($escaped): void {
                $query->whereRaw('LOWER(title) LIKE ? ESCAPE ?', ['%'.$escaped.'%', '\\'])
                    ->orWhereRaw('LOWER(content) LIKE ? ESCAPE ?', ['%'.$escaped.'%', '\\']);
            })
            ->orderByDesc('updated_at')
            ->limit(self::LIMIT)
            ->get();

        $files = Attachment::query()
            ->whereIn('workspace_id', $workspaces->keys())
            ->whereRaw('LOWER(filename) LIKE ? ESCAPE ?', ['%'.$escaped.'%', '\\'])
            ->orderByDesc('created_at')
            ->limit(self::LIMIT)
            ->get();

        return response()->json([
            'data' => [
                'query' => $term,
                'notes' => $notes->map(fn (Note $note): array => [
                    'id' => $note->getKey(),
                    'workspace_id' => $note->workspace_id,
                    'workspace_name' => $workspaces[$note->workspace_id] ?? null,
                    'folder_id' => $note->folder_id,
                    'title' => (string) $note->title,
                    'updated_at' => $note->updated_at?->toISOString(),
                ])->all(),
                'files' => $files->map(fn (Attachment $file): array => [
                    'id' => $file->getKey(),
                    'workspace_id' => $file->workspace_id,
                    'workspace_name' => $workspaces[$file->workspace_id] ?? null,
                    'folder_id' => $file->folder_id,
                    'filename' => $file->filename,
                    'mime_type' => $file->mime_type,
                    'size' => (int) $file->size,
                    'created_at' => $file->created_at?->toISOString(),
                ])->all(),
            ],
        ]);
    }
}
