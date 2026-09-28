<?php

namespace App\Policies;

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

class NotePolicy
{
    public function viewAny(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function view(User $user, Note $note): bool
    {
        return $user->getKey() === $note->workspace?->user_id;
    }

    public function create(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function update(User $user, Note $note): bool
    {
        return $this->view($user, $note);
    }

    public function delete(User $user, Note $note): bool
    {
        return $this->view($user, $note);
    }

    public function restore(User $user, Note $note): bool
    {
        return $this->view($user, $note);
    }

    public function forceDelete(User $user, Note $note): bool
    {
        return $this->view($user, $note);
    }

    public function reorder(User $user): bool
    {
        return true;
    }
}
