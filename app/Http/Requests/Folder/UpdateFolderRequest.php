<?php

namespace App\Http\Requests\Folder;

use App\Models\Folder;
use App\Http\Requests\ApiRequest;
use Illuminate\Validation\Rule;

class UpdateFolderRequest extends ApiRequest
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
        /** @var Folder|null $folder */
        $folder = $this->routeModel('folder', Folder::class);

        $exists = Rule::exists((new Folder)->getTable(), 'id')
            ->where('workspace_id', $folder?->workspace_id);

        if ($folder !== null) {
            // A folder may never be re-parented onto itself or into its own subtree.
            $exists->whereNotIn('id', array_merge([$folder->getKey()], $folder->descendantIds()));
        }

        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'parent_id' => ['sometimes', 'nullable', 'string', 'ulid', $exists],
        ];
    }
}