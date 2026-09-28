<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\WorkspaceScoped;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attachment\IndexAttachmentRequest;
use App\Http\Requests\Attachment\ReorderAttachmentRequest;
use App\Http\Requests\Attachment\StoreAttachmentRequest;
use App\Http\Requests\Attachment\UpdateAttachmentRequest;
use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Workspace;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    use WorkspaceScoped;

    public function index(IndexAttachmentRequest $request, Workspace $workspace): JsonResponse
    {

        $query = Attachment::query()->where('workspace_id', $workspace->getKey());

        if ($request->has('folder_id')) {
            $query->where('folder_id', $request->input('folder_id'));
        }

        if ($request->boolean('trashed')) {
            $query->onlyTrashed();
        }

        if ($request->filled('q')) {
            $needle = '%'.strtolower(LikePattern::escape((string) $request->input('q'))).'%';

            $query->whereRaw('LOWER(filename) LIKE ? ESCAPE ?', [$needle, '\\']);
        }

        $attachments = $query
            ->orderBy('position')
            ->orderBy('created_at')
            ->get();

        return AttachmentResource::collection($attachments)->response();
    }

    public function store(StoreAttachmentRequest $request, Workspace $workspace): JsonResponse
    {
        $file = $request->file('file');
        $folderId = $request->input('folder_id');

        if ($folderId !== null) {
            $this->assertInWorkspace($workspace, Folder::find($folderId));
        }

        $extension = strtolower($file->getClientOriginalExtension());
        $mime = strtolower((string) $file->getMimeType());

        $attributes = [
            'path' => '',
            'filename' => $request->input('filename') ?: $file->getClientOriginalName(),
            'mime_type' => $mime,
            'size' => (int) $file->getSize(),
            'encrypted' => $request->boolean('encrypted'),
            'position' => $this->nextPosition(
                Attachment::query()
                    ->where('workspace_id', $workspace->getKey())
                    ->where('folder_id', $folderId)
            ),
        ];

        // workspace_id comes from the verified route model, never from input.
        $attachment = new Attachment($attributes);
        $attachment->workspace_id = $workspace->getKey();
        $attachment->folder_id = $folderId;
        $attachment->save();

        // The path is keyed on the model's own ULID, so the row and the bytes
        // can never disagree about where the file lives.
        $path = 'attachments/'.$workspace->getKey().'/'.$attachment->getKey().'.'.$extension;

        Storage::disk('local')->put($path, $file->get());

        $attachment->path = $path;
        $attachment->save();

        return (new AttachmentResource($attachment))->response()->setStatusCode(201);
    }

    public function show(Attachment $attachment): JsonResponse
    {
        $this->authorize('view', $attachment);

        return (new AttachmentResource($attachment))->response();
    }

    public function download(Attachment $attachment): StreamedResponse
    {
        $this->authorize('download', $attachment);

        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        return Storage::disk('local')->download($attachment->path, $attachment->filename, [
            'Content-Type' => $attachment->mime_type,
        ]);
    }

    public function preview(Attachment $attachment): StreamedResponse
    {
        $this->authorize('preview', $attachment);

        abort_unless($attachment->isPreviewable(), 404);
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        return Storage::disk('local')->response($attachment->path, $attachment->filename, [
            'Content-Type' => $attachment->mime_type,
            'Content-Disposition' => 'inline; filename="'.addslashes($attachment->filename).'"',
        ]);
    }

    public function update(UpdateAttachmentRequest $request, Attachment $attachment): JsonResponse
    {
        $this->authorize('update', $attachment);

        if ($request->has('filename')) {
            $attachment->filename = $request->string('filename')->toString();
        }

        if ($request->has('folder_id')) {
            $folderId = $request->input('folder_id');

            if ($folderId !== null) {
                $this->assertInWorkspace(Workspace::find($attachment->workspace_id), Folder::find($folderId));
            }

            if ($folderId !== $attachment->folder_id) {
                $attachment->folder_id = $folderId;
                $attachment->position = $this->nextPosition(
                    Attachment::query()
                        ->where('workspace_id', $attachment->workspace_id)
                        ->where('folder_id', $folderId)
                );
            }
        }

        $attachment->save();

        return (new AttachmentResource($attachment->refresh()))->response();
    }

    public function destroy(Attachment $attachment): JsonResponse
    {
        $this->authorize('delete', $attachment);

        // Soft delete keeps the bytes on disk until the row is purged.
        $attachment->delete();

        return response()->json(['message' => 'Attachment deleted.']);
    }

    public function restore(Attachment $attachmentTrashed): JsonResponse
    {
        $attachment = $attachmentTrashed;

        $this->authorize('restore', $attachment);

        $attachment->restore();

        return (new AttachmentResource($attachment->refresh()))->response();
    }

    public function forceDelete(Attachment $attachmentTrashed): JsonResponse
    {
        $attachment = $attachmentTrashed;

        $this->authorize('forceDelete', $attachment);

        DB::transaction(function () use ($attachment): void {
            $attachment->deleteStoredFile();
            $attachment->forceDelete();
        });

        return response()->json(['message' => 'Attachment permanently deleted.']);
    }

    public function reorder(ReorderAttachmentRequest $request): JsonResponse
    {
        $this->authorize('reorder', Attachment::class);

        /** @var list<string> $ids */
        $ids = $request->input('ids');

        $attachments = Attachment::query()
            ->whereIn('id', $ids)
            ->whereHas('workspace', fn (Builder $q) => $q->where('user_id', $request->user()->getKey()))
            ->get()
            ->keyBy('id');

        if ($attachments->count() !== count($ids)) {
            abort(404);
        }

        if ($attachments->pluck('workspace_id')->unique()->count() !== 1) {
            abort(422, 'Every id must belong to the same workspace.');
        }

        $folderId = $request->input('folder_id');
        $scopes = $attachments->pluck('folder_id')->unique();

        if ($request->has('folder_id')) {
            if ($scopes->count() > 1 || $scopes->first() !== $folderId) {
                abort(422, 'Every id must belong to the requested folder.');
            }
        } elseif ($scopes->count() !== 1) {
            abort(422, 'Every id must belong to the same folder list.');
        }

        DB::transaction(function () use ($ids, $attachments): void {
            foreach ($ids as $index => $id) {
                $attachments[$id]->position = $index;
                $attachments[$id]->save();
            }
        });

        return AttachmentResource::collection(
            Attachment::query()->whereIn('id', $ids)->orderBy('position')->get()
        )->response();
    }
}