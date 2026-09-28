<?php

namespace App\Policies;

use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;

class FolderPolicy
{
    public function viewAny(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function view(User $user, Folder $folder): bool
    {
        return $user->getKey() === $folder->workspace?->user_id;
    }

    public function create(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function update(User $user, Folder $folder): bool
    {
        return $this->view($user, $folder);
    }

    public function delete(User $user, Folder $folder): bool
    {
        return $this->view($user, $folder);
    }

    public function restore(User $user, Folder $folder): bool
    {
        return $this->view($user, $folder);
    }

    public function forceDelete(User $user, Folder $folder): bool
    {
        return $this->view($user, $folder);
    }

    public function reorder(User $user): bool
    {
        return true;
    }
}
