<?php

namespace App\Http\Requests\Attachment;

use App\Models\Attachment;
use App\Models\Folder;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpdateAttachmentRequest extends ApiRequest
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
        /** @var Attachment|null $attachment */
        $attachment = $this->routeModel('attachment', Attachment::class);

        return [
            'filename' => ['sometimes', 'required', 'string', 'max:255'],
            'folder_id' => [
                'sometimes',
                'nullable',
                'string',
                'ulid',
                Rule::exists((new Folder)->getTable(), 'id')
                    ->where('workspace_id', $attachment?->workspace_id),
            ],
        ];
    }
}