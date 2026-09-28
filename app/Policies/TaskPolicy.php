<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;

class TaskPolicy
{
    public function viewAny(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function view(User $user, Task $task): bool
    {
        return $user->getKey() === $task->workspace?->user_id;
    }

    public function create(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function update(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }

    public function delete(User $user, Task $task): bool
    {
        return $this->view($user, $task);
    }

    public function reorder(User $user): bool
    {
        return true;
    }
}
