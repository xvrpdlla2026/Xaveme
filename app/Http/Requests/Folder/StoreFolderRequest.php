<?php

namespace App\Http\Requests\Folder;

use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class StoreFolderRequest extends ApiRequest
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
            'name' => ['required', 'string', 'max:255'],
            'parent_id' => [
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $workspace !== null ? $workspace->getKey() : null),
            ],
        ];
    }
}