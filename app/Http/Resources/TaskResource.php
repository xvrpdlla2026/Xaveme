<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Task */
class TaskResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'workspace_id' => $this->workspace_id,
            'folder_id' => $this->folder_id,
            'title' => $this->title,
            'notes' => $this->notes,
            'done' => (bool) $this->done,
            'done_at' => $this->done_at?->toISOString(),
            'due_at' => $this->due_at?->toISOString(),
            'due_has_time' => (bool) $this->due_has_time,
            'priority' => (int) $this->priority,
            'position' => (int) $this->position,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
