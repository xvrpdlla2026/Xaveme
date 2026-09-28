<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin array<string, mixed> */
class WorkspaceStatsResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'workspace_id' => $this->resource['workspace_id'],
            'name' => $this->resource['name'],
            'folders' => (int) $this->resource['folders'],
            'notes' => (int) $this->resource['notes'],
            'attachments' => (int) $this->resource['attachments'],
            'tasks' => (int) $this->resource['tasks'],
            'tasks_done' => (int) $this->resource['tasks_done'],
            'attachment_bytes' => (int) $this->resource['attachment_bytes'],
            'trashed' => [
                'folders' => (int) $this->resource['trashed']['folders'],
                'notes' => (int) $this->resource['trashed']['notes'],
                'attachments' => (int) $this->resource['trashed']['attachments'],
            ],
        ];
    }
}
