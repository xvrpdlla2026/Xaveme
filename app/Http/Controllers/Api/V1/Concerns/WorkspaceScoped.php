<?php

namespace App\Http\Controllers\Api\V1\Concerns;

use App\Models\Workspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

trait WorkspaceScoped
{
    /**
     * A nested route may name a child that exists but lives in another
     * workspace. Never trust the path alone: hide the row instead.
     */
    protected function assertInWorkspace(Workspace $workspace, ?Model $child): void
    {
        if ($child === null || $child->getAttribute('workspace_id') !== $workspace->getKey()) {
            abort(404);
        }
    }

    protected function nextPosition(Builder $query): int
    {
        $max = (clone $query)->max('position');

        return $max === null ? 0 : ((int) $max) + 1;
    }
}
