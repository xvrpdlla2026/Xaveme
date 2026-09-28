<?php

namespace App\Http\Requests\Attachment;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;
use App\Http\Requests\ApiRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

class StoreAttachmentRequest extends ApiRequest
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
            'file' => ['required', 'file', 'max:20480', function (string $attribute, mixed $value, \Closure $fail): void {
                if (! $value instanceof UploadedFile) {
                    return;
                }

                $extension = strtolower($value->getClientOriginalExtension());
                $mime = strtolower((string) $value->getMimeType());

                if (! isset(Attachment::ALLOWED_TYPES[$extension])) {
                    $fail('The file extension is not allowed.');

                    return;
                }

                if (! in_array($mime, Attachment::ALLOWED_TYPES[$extension], true)) {
                    $fail('The file type does not match its extension.');
                }
            }],
            'filename' => ['sometimes', 'nullable', 'string', 'max:255'],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $workspace !== null ? $workspace->getKey() : null),
            ],
            'encrypted' => ['sometimes', 'boolean'],
        ];
    }
}