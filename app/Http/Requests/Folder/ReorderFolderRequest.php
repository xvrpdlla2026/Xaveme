<?php

namespace App\Http\Requests\Folder;

use App\Http\Requests\ApiRequest;

class ReorderFolderRequest extends ApiRequest
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
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'string', 'ulid', 'distinct'],
            'parent_id' => ['sometimes', 'nullable', 'string', 'ulid'],
        ];
    }
}