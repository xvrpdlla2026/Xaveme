<?php

namespace App\Http\Requests\Note;

use App\Models\Folder;
use App\Models\Note;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpdateNoteRequest extends ApiRequest
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
        /** @var Note|null $note */
        $note = $this->routeModel('note', Note::class);

        return [
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'content' => ['sometimes', 'nullable', 'string'],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $note?->workspace_id),
            ],
            'encrypted' => ['sometimes', 'boolean'],
        ];
    }
}