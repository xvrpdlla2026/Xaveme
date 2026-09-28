<?php

namespace App\Http\Requests\Trash;

use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class RestoreTrashRequest extends ApiRequest
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
            'type' => ['required', 'string', Rule::in(['folder', 'note', 'attachment'])],
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'string', 'ulid', 'distinct'],
        ];
    }
}