<?php

namespace App\Http\Requests\Task;

use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class IndexTaskRequest extends ApiRequest
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
            'view' => ['sometimes', 'string', Rule::in(['all', 'today', 'upcoming', 'overdue', 'done'])],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $workspace !== null ? $workspace->getKey() : null),
            ],
            'q' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}