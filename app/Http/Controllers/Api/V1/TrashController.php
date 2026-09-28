<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Trash\PurgeTrashRequest;
use App\Http\Requests\Trash\PurgeTrashRowRequest;
use App\Http\Requests\Trash\RestoreTrashRequest;
use App\Http\Resources\AttachmentResource;
use App\Http\Resources\FolderResource;
use App\Http\Resources\NoteResource;
use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TrashController extends Controller
{
    public function index(Workspace $workspace): JsonResponse
    {
        $this->authorize('view', $workspace);

        $folders = Folder::onlyTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->orderByDesc('deleted_at')
            ->get();

        $notes = Note::onlyTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->orderByDesc('deleted_at')
            ->get();

        $attachments = Attachment::onlyTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->orderByDesc('deleted_at')
            ->get();

        return response()->json([
            'data' => [
                'folders' => FolderResource::collection($folders)->resolve(),
                'notes' => NoteResource::collection($notes)->resolve(),
                'attachments' => AttachmentResource::collection($attachments)->resolve(),
            ],
        ]);
    }

    public function restore(RestoreTrashRequest $request, Workspace $workspace): JsonResponse
    {
        /** @var list<string> $ids */
        $ids = $request->input('ids');
        $type = (string) $request->input('type');

        $restored = match ($type) {
            'folder' => $this->restoreFolders($workspace, $ids),
            'note' => $this->restoreNotes($workspace, $ids),
            default => $this->restoreAttachments($workspace, $ids),
        };

        return response()->json([
            'data' => [
                'type' => $type,
                'restored' => $restored,
            ],
        ]);
    }

    public function purge(PurgeTrashRequest $request, Workspace $workspace): JsonResponse
    {
        $purged = DB::transaction(function () use ($workspace): array {
            $folders = $this->purgeFolders($workspace, Folder::onlyTrashed()
                ->where('workspace_id', $workspace->getKey())
                ->pluck('id')
                ->all());

            $notes = Note::onlyTrashed()->where('workspace_id', $workspace->getKey())->forceDelete();
            $attachments = $this->purgeAttachments($workspace, Attachment::onlyTrashed()
                ->where('workspace_id', $workspace->getKey())
                ->pluck('id')
                ->all());

            return [
                'folders' => $folders,
                'notes' => $notes,
                'attachments' => $attachments,
            ];
        });

        return response()->json(['data' => $purged]);
    }

    public function purgeOne(PurgeTrashRowRequest $request, Workspace $workspace, string $type, string $id): JsonResponse
    {

        $purged = DB::transaction(function () use ($workspace, $type, $id): int {
            return match ($type) {
                'folder' => $this->purgeFolders($workspace, [$id]),
                'note' => Note::onlyTrashed()
                    ->where('workspace_id', $workspace->getKey())
                    ->where('id', $id)
                    ->forceDelete(),
                default => $this->purgeAttachments($workspace, [$id]),
            };
        });

        abort_if($purged === 0, 404);

        return response()->json([
            'data' => [
                'type' => $type,
                'id' => $id,
                'purged' => $purged,
            ],
        ]);
    }

    /**
     * @param  list<string>  $ids
     */
    private function restoreFolders(Workspace $workspace, array $ids): int
    {
        return DB::transaction(function () use ($workspace, $ids): int {
            $folders = Folder::onlyTrashed()
                ->where('workspace_id', $workspace->getKey())
                ->whereIn('id', $ids)
                ->get();

            $restored = 0;

            foreach ($folders as $folder) {
                $subtree = array_merge([$folder->getKey()], $folder->descendantIds());

                Folder::onlyTrashed()->whereIn('id', $subtree)->restore();
                Note::onlyTrashed()->whereIn('folder_id', $subtree)->restore();
                Attachment::onlyTrashed()->whereIn('folder_id', $subtree)->restore();

                $restored++;
            }

            return $restored;
        });
    }

    /**
     * @param  list<string>  $ids
     */
    private function restoreNotes(Workspace $workspace, array $ids): int
    {
        return Note::onlyTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->whereIn('id', $ids)
            ->restore();
    }

    /**
     * @param  list<string>  $ids
     */
    private function restoreAttachments(Workspace $workspace, array $ids): int
    {
        return Attachment::onlyTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->whereIn('id', $ids)
            ->restore();
    }

    /**
     * @param  list<string>  $ids
     */
    private function purgeFolders(Workspace $workspace, array $ids): int
    {
        $folderIds = [];

        foreach ($ids as $id) {
            $folder = Folder::withTrashed()
                ->where('workspace_id', $workspace->getKey())
                ->find($id);

            if ($folder === null) {
                continue;
            }

            $folderIds = array_merge($folderIds, [$folder->getKey()], $folder->descendantIds());
        }

        $folderIds = array_values(array_unique($folderIds));

        if ($folderIds === []) {
            return 0;
        }

        $this->purgeAttachments($workspace, Attachment::withTrashed()
            ->whereIn('folder_id', $folderIds)
            ->pluck('id')
            ->all());

        Note::withTrashed()->whereIn('folder_id', $folderIds)->forceDelete();

        return Folder::withTrashed()->whereIn('id', $folderIds)->forceDelete();
    }

    /**
     * @param  list<string>  $ids
     */
    private function purgeAttachments(Workspace $workspace, array $ids): int
    {
        $attachments = Attachment::withTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->whereIn('id', $ids)
            ->get();

        foreach ($attachments as $attachment) {
            $attachment->deleteStoredFile();
        }

        return Attachment::withTrashed()
            ->where('workspace_id', $workspace->getKey())
            ->whereIn('id', $ids)
            ->forceDelete();
    }
}