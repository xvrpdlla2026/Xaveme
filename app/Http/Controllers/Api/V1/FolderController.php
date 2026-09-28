<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\WorkspaceScoped;
use App\Http\Controllers\Controller;
use App\Http\Requests\Folder\IndexFolderRequest;
use App\Http\Requests\Folder\ReorderFolderRequest;
use App\Http\Requests\Folder\StoreFolderRequest;
use App\Http\Requests\Folder\UpdateFolderRequest;
use App\Http\Resources\FolderResource;
use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class FolderController extends Controller
{
    use WorkspaceScoped;

    public function index(IndexFolderRequest $request, Workspace $workspace): JsonResponse
    {
        $folders = Folder::query()
            ->where('workspace_id', $workspace->getKey())
            ->when($request->boolean('trashed'), fn (Builder $q) => $q->onlyTrashed())
            ->orderBy('position')
            ->orderBy('created_at')
            ->get();

        return FolderResource::collection($folders)->response();
    }

    public function store(StoreFolderRequest $request, Workspace $workspace): JsonResponse
    {
        $parentId = $request->input('parent_id');

        if ($parentId !== null) {
            $parent = Folder::where('workspace_id', $workspace->getKey())->find($parentId);
            $this->assertInWorkspace($workspace, $parent);
        }

        $position = $this->nextPosition(
            Folder::query()
                ->where('workspace_id', $workspace->getKey())
                ->where('parent_id', $parentId)
        );

        // workspace_id is set from the verified route model, never from input,
        // and parent_id only on the sibling list that was just validated.
        $folder = new Folder([
            'name' => $request->string('name')->toString(),
            'position' => $position,
        ]);
        $folder->workspace_id = $workspace->getKey();
        $folder->parent_id = $parentId;
        $folder->save();

        return (new FolderResource($folder))->response()->setStatusCode(201);
    }

    public function show(Folder $folder): JsonResponse
    {
        $this->authorize('view', $folder);

        return (new FolderResource($folder))->response();
    }

    public function update(UpdateFolderRequest $request, Folder $folder): JsonResponse
    {
        $this->authorize('update', $folder);

        $workspaceId = $folder->workspace_id;

        if ($request->has('name')) {
            $folder->name = $request->string('name')->toString();
        }

        if ($request->has('parent_id')) {
            $parentId = $request->input('parent_id');

            if ($parentId === $folder->getKey()) {
                abort(422, 'A folder cannot be its own parent.');
            }

            if ($parentId !== null && in_array($parentId, $folder->descendantIds(), true)) {
                abort(422, 'A folder cannot be moved inside itself.');
            }

            if ($parentId !== $folder->parent_id) {
                $folder->parent_id = $parentId;
                $folder->position = $this->nextPosition(
                    Folder::query()
                        ->where('workspace_id', $workspaceId)
                        ->where('parent_id', $parentId)
                );
            }
        }

        $folder->save();

        return (new FolderResource($folder->refresh()))->response();
    }

    public function destroy(Folder $folder): JsonResponse
    {
        $this->authorize('delete', $folder);

        DB::transaction(function () use ($folder): void {
            $ids = array_merge([$folder->getKey()], $folder->descendantIds());

            Note::whereIn('folder_id', $ids)->delete();
            Attachment::whereIn('folder_id', $ids)->delete();
            Folder::whereIn('id', $ids)->delete();
        });

        return response()->json(['message' => 'Folder deleted.']);
    }

    public function restore(Folder $folderTrashed): JsonResponse
    {
        $folder = $folderTrashed;

        $this->authorize('restore', $folder);

        DB::transaction(function () use ($folder): void {
            $ids = array_merge([$folder->getKey()], $folder->descendantIds());

            Folder::onlyTrashed()->whereIn('id', $ids)->restore();
            Note::onlyTrashed()->whereIn('folder_id', $ids)->restore();
            Attachment::onlyTrashed()->whereIn('folder_id', $ids)->restore();
        });

        return (new FolderResource($folder->refresh()))->response();
    }

    public function forceDelete(Folder $folderTrashed): JsonResponse
    {
        $folder = $folderTrashed;

        $this->authorize('forceDelete', $folder);

        DB::transaction(function () use ($folder): void {
            $ids = array_merge([$folder->getKey()], $folder->descendantIds());

            $paths = Attachment::withTrashed()->whereIn('folder_id', $ids)->pluck('path')->all();

            foreach ($paths as $path) {
                if ($path && Storage::disk('local')->exists($path)) {
                    Storage::disk('local')->delete($path);
                }
            }

            Attachment::withTrashed()->whereIn('folder_id', $ids)->forceDelete();
            Note::withTrashed()->whereIn('folder_id', $ids)->forceDelete();
            Folder::withTrashed()->whereIn('id', $ids)->forceDelete();
        });

        return response()->json(['message' => 'Folder permanently deleted.']);
    }

    public function reorder(ReorderFolderRequest $request): JsonResponse
    {
        $this->authorize('reorder', Folder::class);

        /** @var list<string> $ids */
        $ids = $request->input('ids');

        $folders = Folder::query()
            ->whereIn('id', $ids)
            ->whereHas('workspace', fn (Builder $q) => $q->where('user_id', $request->user()->getKey()))
            ->get()
            ->keyBy('id');

        if ($folders->count() !== count($ids)) {
            abort(404);
        }

        $workspaceIds = $folders->pluck('workspace_id')->unique();
        $parentIds = $folders->pluck('parent_id')->unique();

        if ($workspaceIds->count() !== 1 || $parentIds->count() !== 1) {
            abort(422, 'Every id must belong to the same folder list.');
        }

        DB::transaction(function () use ($ids, $folders): void {
            // (workspace_id, parent_id, position) is unique, so clear the
            // sibling range before writing the final 0..n-1 sequence.
            Folder::query()->whereIn('id', $ids)->update(['position' => DB::raw('position + 1000000')]);

            foreach ($ids as $index => $id) {
                $folders[$id]->position = $index;
                $folders[$id]->save();
            }
        });

        return FolderResource::collection(
            Folder::query()
                ->whereIn('id', $ids)
                ->orderBy('position')
                ->get()
        )->response();
    }
}