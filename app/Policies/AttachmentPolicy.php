<?php

namespace App\Policies;

use App\Models\Attachment;
use App\Models\User;
use App\Models\Workspace;

class AttachmentPolicy
{
    public function viewAny(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function view(User $user, Attachment $attachment): bool
    {
        return $user->getKey() === $attachment->workspace?->user_id;
    }

    public function create(User $user, Workspace $workspace): bool
    {
        return $user->getKey() === $workspace->user_id;
    }

    public function update(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function delete(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function restore(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function forceDelete(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function download(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function preview(User $user, Attachment $attachment): bool
    {
        return $this->view($user, $attachment);
    }

    public function reorder(User $user): bool
    {
        return true;
    }
}
