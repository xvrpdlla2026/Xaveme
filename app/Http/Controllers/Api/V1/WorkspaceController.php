<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\WorkspaceScoped;
use App\Http\Controllers\Controller;
use App\Http\Requests\Workspace\ReorderWorkspaceRequest;
use App\Http\Requests\Workspace\StoreWorkspaceRequest;
use App\Http\Requests\Workspace\UpdateWorkspaceRequest;
use App\Http\Resources\WorkspaceResource;
use App\Http\Resources\WorkspaceStatsResource;
use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Task;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class WorkspaceController extends Controller
{
    use WorkspaceScoped;

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Workspace::class);

        $workspaces = Workspace::query()
            ->where('user_id', $request->user()->getKey())
            ->orderBy('position')
            ->orderBy('created_at')
            ->get();

        return WorkspaceResource::collection($workspaces)->response();
    }

    public function store(StoreWorkspaceRequest $request): JsonResponse
    {
        $this->authorize('create', Workspace::class);

        $position = $this->nextPosition(
            Workspace::query()->where('user_id', $request->user()->getKey())
        );

        // The owning relationship pins user_id, so it can never come from input.
        $workspace = $request->user()->workspaces()->create([
            'name' => $request->string('name')->toString(),
            'position' => $position,
        ]);

        return (new WorkspaceResource($workspace))->response()->setStatusCode(201);
    }

    public function show(Workspace $workspace): JsonResponse
    {
        $this->authorize('view', $workspace);

        return (new WorkspaceResource($workspace))->response();
    }

    public function update(UpdateWorkspaceRequest $request, Workspace $workspace): JsonResponse
    {
        $this->authorize('update', $workspace);

        if ($request->has('name')) {
            $workspace->name = $request->string('name')->toString();
            $workspace->save();
        }

        return (new WorkspaceResource($workspace->refresh()))->response();
    }

    public function destroy(Workspace $workspace): JsonResponse
    {
        $this->authorize('delete', $workspace);

        DB::transaction(function () use ($workspace): void {
            $folderIds = $workspace->folderIds();

            $this->deleteAttachmentFiles($workspace->getKey(), $folderIds);

            Attachment::withTrashed()->where('workspace_id', $workspace->getKey())->forceDelete();
            Note::withTrashed()->where('workspace_id', $workspace->getKey())->forceDelete();
            Task::where('workspace_id', $workspace->getKey())->delete();
            Folder::withTrashed()->where('workspace_id', $workspace->getKey())->forceDelete();

            $workspace->delete();
        });

        return response()->json(['message' => 'Workspace deleted.']);
    }

    public function stats(Workspace $workspace): JsonResponse
    {
        $this->authorize('view', $workspace);

        $stats = [
            'workspace_id' => $workspace->getKey(),
            'name' => $workspace->name,
            'folders' => Folder::where('workspace_id', $workspace->getKey())->count(),
            'notes' => Note::where('workspace_id', $workspace->getKey())->count(),
            'attachments' => Attachment::where('workspace_id', $workspace->getKey())->count(),
            'tasks' => Task::where('workspace_id', $workspace->getKey())->count(),
            'tasks_done' => Task::where('workspace_id', $workspace->getKey())->where('done', true)->count(),
            'attachment_bytes' => (int) Attachment::where('workspace_id', $workspace->getKey())->sum('size'),
            'trashed' => [
                'folders' => Folder::onlyTrashed()->where('workspace_id', $workspace->getKey())->count(),
                'notes' => Note::onlyTrashed()->where('workspace_id', $workspace->getKey())->count(),
                'attachments' => Attachment::onlyTrashed()->where('workspace_id', $workspace->getKey())->count(),
            ],
        ];

        return (new WorkspaceStatsResource($stats))->response();
    }

    public function reorder(ReorderWorkspaceRequest $request): JsonResponse
    {
        $this->authorize('reorder', Workspace::class);

        /** @var list<string> $ids */
        $ids = $request->input('ids');

        $workspaces = Workspace::query()
            ->where('user_id', $request->user()->getKey())
            ->whereIn('id', $ids)
            ->get()
            ->keyBy('id');

        if ($workspaces->count() !== count($ids)) {
            abort(404);
        }

        $userId = $request->user()->getKey();

        DB::transaction(function () use ($ids, $workspaces, $userId): void {
            // (user_id, position) is unique, so park every row outside the
            // target range before writing the final 0..n-1 sequence.
            Workspace::query()
                ->where('user_id', $userId)
                ->update(['position' => DB::raw('position + 1000000')]);

            foreach ($ids as $index => $id) {
                $workspaces[$id]->position = $index;
                $workspaces[$id]->save();
            }
        });

        return WorkspaceResource::collection(
            Workspace::query()
                ->where('user_id', $request->user()->getKey())
                ->orderBy('position')
                ->get()
        )->response();
    }

    /**
     * @param  list<string>  $folderIds
     */
    private function deleteAttachmentFiles(string $workspaceId, array $folderIds): void
    {
        $paths = Attachment::withTrashed()
            ->where('workspace_id', $workspaceId)
            ->pluck('path')
            ->all();

        foreach ($paths as $path) {
            if ($path && Storage::disk('local')->exists($path)) {
                Storage::disk('local')->delete($path);
            }
        }
    }
}
