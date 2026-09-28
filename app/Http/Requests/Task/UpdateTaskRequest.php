<?php

namespace App\Http\Requests\Task;

use App\Models\Folder;
use App\Models\Task;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpdateTaskRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Task|null $task */
        $task = $this->routeModel('task', Task::class);

        return [
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'done' => ['sometimes', 'boolean'],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'due_has_time' => ['sometimes', 'boolean'],
            'priority' => ['sometimes', 'integer', 'min:0', 'max:3'],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $task?->workspace_id),
            ],
        ];
    }
}