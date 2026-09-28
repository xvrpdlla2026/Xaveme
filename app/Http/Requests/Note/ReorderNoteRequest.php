<?php

namespace App\Http\Requests\Note;

use App\Http\Requests\ApiRequest;

class ReorderNoteRequest extends ApiRequest
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
            'folder_id' => ['sometimes', 'nullable', 'string', 'ulid'],
        ];
    }
}