<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Api\V1\Concerns\WorkspaceScoped;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\IndexTaskRequest;
use App\Http\Requests\Task\ReorderTaskRequest;
use App\Http\Requests\Task\StoreTaskRequest;
use App\Http\Requests\Task\UpdateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Folder;
use App\Models\Task;
use App\Models\Workspace;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class TaskController extends Controller
{
    use WorkspaceScoped;

    public function index(IndexTaskRequest $request, Workspace $workspace): JsonResponse
    {

        $query = Task::query()->where('workspace_id', $workspace->getKey());

        if ($request->has('folder_id')) {
            $query->where('folder_id', $request->input('folder_id'));
        }

        if ($request->filled('q')) {
            $needle = '%'.strtolower(LikePattern::escape((string) $request->input('q'))).'%';

            $query->where(function (Builder $q) use ($needle): void {
                $q->whereRaw('LOWER(title) LIKE ? ESCAPE ?', [$needle, '\\'])
                    ->orWhereRaw('LOWER(notes) LIKE ? ESCAPE ?', [$needle, '\\']);
            });
        }

        $this->applyView($query, (string) $request->input('view', 'all'));

        $tasks = $query
            ->orderBy('position')
            ->orderBy('created_at')
            ->get();

        return TaskResource::collection($tasks)->response();
    }

    public function store(StoreTaskRequest $request, Workspace $workspace): JsonResponse
    {
        $folderId = $request->input('folder_id');

        if ($folderId !== null) {
            $this->assertInWorkspace($workspace, Folder::find($folderId));
        }

        $attributes = [
            'title' => $request->string('title')->toString(),
            'notes' => $request->input('notes'),
            'due_at' => $request->input('due_at'),
            'due_has_time' => $request->boolean('due_has_time'),
            'priority' => (int) $request->input('priority', 0),
            'done' => false,
            'position' => $this->nextPosition(
                Task::query()->where('workspace_id', $workspace->getKey())
            ),
        ];

        // workspace_id comes from the verified route model, never from input.
        $task = new Task($attributes);
        $task->workspace_id = $workspace->getKey();
        $task->folder_id = $folderId;
        $task->save();

        return (new TaskResource($task))->response()->setStatusCode(201);
    }

    public function show(Task $task): JsonResponse
    {
        $this->authorize('view', $task);

        return (new TaskResource($task))->response();
    }

    public function update(UpdateTaskRequest $request, Task $task): JsonResponse
    {
        $this->authorize('update', $task);

        foreach (['title', 'notes', 'due_at', 'due_has_time', 'priority'] as $field) {
            if ($request->has($field)) {
                $task->{$field} = $request->input($field);
            }
        }

        if ($request->has('folder_id')) {
            $folderId = $request->input('folder_id');

            if ($folderId !== null) {
                $this->assertInWorkspace(Workspace::find($task->workspace_id), Folder::find($folderId));
            }

            $task->folder_id = $folderId;
        }

        if ($request->has('done')) {
            $task->done = $request->boolean('done');
        }

        $task->save();

        return (new TaskResource($task->refresh()))->response();
    }

    public function destroy(Task $task): JsonResponse
    {
        $this->authorize('delete', $task);

        $task->delete();

        return response()->json(['message' => 'Task deleted.']);
    }

    public function reorder(ReorderTaskRequest $request): JsonResponse
    {
        $this->authorize('reorder', Task::class);

        /** @var list<string> $ids */
        $ids = $request->input('ids');

        $tasks = Task::query()
            ->whereIn('id', $ids)
            ->whereHas('workspace', fn (Builder $q) => $q->where('user_id', $request->user()->getKey()))
            ->get()
            ->keyBy('id');

        if ($tasks->count() !== count($ids)) {
            abort(404);
        }

        if ($tasks->pluck('workspace_id')->unique()->count() !== 1) {
            abort(422, 'Every id must belong to the same workspace.');
        }

        DB::transaction(function () use ($ids, $tasks): void {
            foreach ($ids as $index => $id) {
                $tasks[$id]->position = $index;
                $tasks[$id]->save();
            }
        });

        return TaskResource::collection(
            Task::query()->whereIn('id', $ids)->orderBy('position')->get()
        )->response();
    }

    /** @param Builder<Task> $query */
    private function applyView(Builder $query, string $view): void
    {
        $now = Carbon::now();

        match ($view) {
            'done' => $query->where('done', true),
            'today' => $query->where('done', false)
                ->whereNotNull('due_at')
                ->where('due_at', '<=', $now->copy()->endOfDay()),
            'upcoming' => $query->where('done', false)
                ->whereNotNull('due_at')
                ->where('due_at', '>', $now->copy()->endOfDay()),
            'overdue' => $query->where('done', false)
                ->whereNotNull('due_at')
                ->where('due_at', '<', $now->copy()->startOfDay()),
            default => $query,
        };
    }
}