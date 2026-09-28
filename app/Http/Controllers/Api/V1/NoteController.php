<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\WorkspaceScoped;
use App\Http\Controllers\Controller;
use App\Http\Requests\Note\IndexNoteRequest;
use App\Http\Requests\Note\ReorderNoteRequest;
use App\Http\Requests\Note\StoreNoteRequest;
use App\Http\Requests\Note\UpdateNoteRequest;
use App\Http\Resources\NoteResource;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Workspace;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class NoteController extends Controller
{
    use WorkspaceScoped;

    public function index(IndexNoteRequest $request, Workspace $workspace): JsonResponse
    {
        $folderId = $request->input('folder_id');

        $query = Note::query()->where('workspace_id', $workspace->getKey());

        if ($request->has('folder_id')) {
            $query->where('folder_id', $folderId);
        }

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($request->filled('q')) {
            $needle = '%'.strtolower(LikePattern::escape((string) $request->input('q'))).'%';

            $query->where(function (Builder $q) use ($needle): void {
                $q->whereRaw('LOWER(title) LIKE ? ESCAPE ?', [$needle, '\\'])
                    ->orWhereRaw('LOWER(content) LIKE ? ESCAPE ?', [$needle, '\\']);
            });
        }

        $this->applySort($query, (string) $request->input('sort', 'updated'));

        $perPage = (int) $request->input('per_page', 50);

        return NoteResource::collection($query->paginate($perPage))->response();
    }

    public function store(StoreNoteRequest $request, Workspace $workspace): JsonResponse
    {
        $folderId = $request->input('folder_id');

        if ($folderId !== null) {
            $this->assertInWorkspace($workspace, Folder::find($folderId));
        }

        $position = $this->nextPosition(
            Note::query()
                ->where('workspace_id', $workspace->getKey())
                ->where('folder_id', $folderId)
        );

        $attributes = [
            'title' => $request->input('title') ?? '',
            'content' => $request->input('content'),
            'encrypted' => $request->boolean('encrypted'),
            'position' => $position,
        ];

        // workspace_id comes from the verified route model, never from input.
        // folder_id was already checked to belong to this workspace.
        $note = new Note($attributes);
        $note->workspace_id = $workspace->getKey();
        $note->folder_id = $folderId;
        $note->save();

        return (new NoteResource($note))->response()->setStatusCode(201);
    }

    public function show(Note $note): JsonResponse
    {
        $this->authorize('view', $note);

        return (new NoteResource($note))->response();
    }

    public function update(UpdateNoteRequest $request, Note $note): JsonResponse
    {
        $this->authorize('update', $note);

        if ($request->has('folder_id')) {
            $folderId = $request->input('folder_id');

            if ($folderId !== null) {
                $workspace = Workspace::find($note->workspace_id);
                $this->assertInWorkspace($workspace, Folder::find($folderId));
            }

            if ($folderId !== $note->folder_id) {
                $note->folder_id = $folderId;
                $note->position = $this->nextPosition(
                    Note::query()
                        ->where('workspace_id', $note->workspace_id)
                        ->where('folder_id', $folderId)
                );
            }
        }

        if ($request->has('title')) {
            $note->title = (string) $request->input('title');
        }

        if ($request->has('content')) {
            $note->content = $request->input('content');
        }

        if ($request->has('encrypted')) {
            $note->encrypted = $request->boolean('encrypted');
        }

        $note->save();

        return (new NoteResource($note->refresh()))->response();
    }

    public function destroy(Note $note): JsonResponse
    {
        $this->authorize('delete', $note);

        $note->delete();

        return response()->json(['message' => 'Note deleted.']);
    }

    public function restore(Note $noteTrashed): JsonResponse
    {
        $note = $noteTrashed;

        $this->authorize('restore', $note);

        $note->restore();

        return (new NoteResource($note->refresh()))->response();
    }

    public function forceDelete(Note $noteTrashed): JsonResponse
    {
        $note = $noteTrashed;

        $this->authorize('forceDelete', $note);

        $note->forceDelete();

        return response()->json(['message' => 'Note permanently deleted.']);
    }

    public function reorder(ReorderNoteRequest $request): JsonResponse
    {
        $this->authorize('reorder', Note::class);

        /** @var list<string> $ids */
        $ids = $request->input('ids');

        $notes = Note::query()
            ->whereIn('id', $ids)
            ->whereHas('workspace', fn (Builder $q) => $q->where('user_id', $request->user()->getKey()))
            ->get()
            ->keyBy('id');

        if ($notes->count() !== count($ids)) {
            abort(404);
        }

        if ($notes->pluck('workspace_id')->unique()->count() !== 1) {
            abort(422, 'Every id must belong to the same workspace.');
        }

        $folderId = $request->input('folder_id');
        $scopes = $notes->pluck('folder_id')->unique();

        if ($request->has('folder_id')) {
            if ($scopes->count() > 1 || $scopes->first() !== $folderId) {
                abort(422, 'Every id must belong to the requested folder.');
            }
        } elseif ($scopes->count() !== 1) {
            abort(422, 'Every id must belong to the same folder list.');
        }

        DB::transaction(function () use ($ids, $notes): void {
            foreach ($ids as $index => $id) {
                $notes[$id]->position = $index;
                $notes[$id]->save();
            }
        });

        return NoteResource::collection(
            Note::query()->whereIn('id', $ids)->orderBy('position')->get()
        )->response();
    }

    /** @param Builder<Note> $query */
    private function applySort(Builder $query, string $sort): void
    {
        match ($sort) {
            'created' => $query->orderByDesc('created_at')->orderByDesc('id'),
            'title' => $query->orderByRaw('LOWER(title) asc')->orderBy('id'),
            'manual' => $query->orderBy('position')->orderBy('created_at'),
            default => $query->orderByDesc('updated_at')->orderByDesc('id'),
        };
    }
}