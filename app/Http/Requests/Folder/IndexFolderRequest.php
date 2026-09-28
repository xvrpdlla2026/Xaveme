<?php

namespace App\Http\Requests\Folder;

use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;

class IndexFolderRequest extends ApiRequest
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
        return [
            'trashed' => ['sometimes', 'boolean'],
        ];
    }
}