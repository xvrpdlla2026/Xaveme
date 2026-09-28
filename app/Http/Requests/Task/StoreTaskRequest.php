<?php

namespace App\Http\Requests\Task;

use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class StoreTaskRequest extends ApiRequest
{
    public function authorize(): bool
    {
        $workspace = $this->workspaceFromRoute();

        return $workspace !== null
            && $this->user() instanceof User
            && $this->user()->getKey() === $workspace->user_id;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $workspace = $this->workspaceFromRoute();

        return [
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $workspace !== null ? $workspace->getKey() : null),
            ],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'due_has_time' => ['sometimes', 'boolean'],
            'priority' => ['sometimes', 'integer', 'min:0', 'max:3'],
        ];
    }
}