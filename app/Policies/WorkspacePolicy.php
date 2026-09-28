<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Workspace;

class WorkspacePolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Workspace $workspace): bool
    {
        return $this->view($user, $workspace);
    }

    public function delete(User $user, Workspace $workspace): bool
    {
        return $this->view($user, $workspace);
    }

    public function reorder(User $user): bool
    {
        return true;
    }
}
