<?php

namespace App\Http\Requests\Note;

use App\Http\Requests\ApiRequest;
use App\Models\Folder;
use Illuminate\Validation\Rule;

class IndexNoteRequest extends ApiRequest
{
    public function authorize(): bool
    {
        return $this->ownsWorkspace($this->workspaceFromRoute());
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $workspace = $this->workspaceFromRoute();

        return [
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $workspace === null ? null : $workspace->getKey()),
            ],
            'q' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sort' => ['sometimes', 'string', Rule::in(['updated', 'created', 'title', 'manual'])],
            'trashed' => ['sometimes', 'boolean'],
            'cursor' => ['sometimes', 'nullable', 'string'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
