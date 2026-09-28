<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FolderTest extends TestCase
{
    use RefreshDatabase;

    private function workspaceFor(User $user): Workspace
    {
        return Workspace::factory()->create(['user_id' => $user->getKey()]);
    }

    public function test_index_lists_workspace_folders_ordered_by_position(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);

        Folder::factory()->create(['workspace_id' => $workspace->getKey(), 'name' => 'Second', 'position' => 1]);
        Folder::factory()->create(['workspace_id' => $workspace->getKey(), 'name' => 'First', 'position' => 0]);
        Folder::factory()->create(['name' => 'Other']);

        $response = $this->actingAs($user)
            ->getJson('/api/v1/workspaces/'.$workspace->getKey().'/folders')
            ->assertOk();

        $this->assertCount(2, $response->json('data'));
        $this->assertSame('First', $response->json('data.0.name'));
        $this->assertSame('Second', $response->json('data.1.name'));
    }

    public function test_store_creates_a_nested_folder(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $parent = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);

        $this->actingAs($user)->postJson('/api/v1/workspaces/'.$workspace->getKey().'/folders', [
            'name' => 'Child',
            'parent_id' => $parent->getKey(),
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Child')
            ->assertJsonPath('data.parent_id', $parent->getKey())
            ->assertJsonPath('data.position', 0);
    }

    public function test_store_rejects_a_parent_from_another_workspace(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $other = Folder::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/workspaces/'.$workspace->getKey().'/folders', [
            'name' => 'Child',
            'parent_id' => $other->getKey(),
        ])->assertStatus(422)->assertJsonValidationErrors('parent_id');
    }

    public function test_update_renames_and_prevents_a_cyclic_move(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $parent = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $workspace->getKey(),
            'parent_id' => $parent->getKey(),
        ]);

        $this->actingAs($user)->patchJson('/api/v1/folders/'.$child->getKey(), ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed');

        $this->actingAs($user)->patchJson('/api/v1/folders/'.$parent->getKey(), [
            'parent_id' => $child->getKey(),
        ])->assertStatus(422);
    }

    public function test_destroy_soft_deletes_the_subtree_with_its_notes_and_attachments(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $root = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $workspace->getKey(),
            'parent_id' => $root->getKey(),
        ]);
        $note = Note::factory()->create(['workspace_id' => $workspace->getKey(), 'folder_id' => $child->getKey()]);
        $attachment = Attachment::factory()->create(['workspace_id' => $workspace->getKey(), 'folder_id' => $child->getKey()]);

        $this->actingAs($user)->deleteJson('/api/v1/folders/'.$root->getKey())->assertOk();

        $this->assertSoftDeleted('folders', ['id' => $root->getKey()]);
        $this->assertSoftDeleted('folders', ['id' => $child->getKey()]);
        $this->assertSoftDeleted('notes', ['id' => $note->getKey()]);
        $this->assertSoftDeleted('attachments', ['id' => $attachment->getKey()]);

        $this->actingAs($user)->getJson('/api/v1/workspaces/'.$workspace->getKey().'/folders')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($user)->getJson('/api/v1/workspaces/'.$workspace->getKey().'/folders?trashed=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_restore_brings_back_the_subtree(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $root = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $workspace->getKey(),
            'parent_id' => $root->getKey(),
        ]);
        $note = Note::factory()->create(['workspace_id' => $workspace->getKey(), 'folder_id' => $child->getKey()]);

        $this->actingAs($user)->deleteJson('/api/v1/folders/'.$root->getKey())->assertOk();
        $this->actingAs($user)->postJson('/api/v1/folders/'.$root->getKey().'/restore')->assertOk();

        $this->assertNull($root->refresh()->deleted_at);
        $this->assertNull($child->refresh()->deleted_at);
        $this->assertNull($note->refresh()->deleted_at);
    }

    public function test_force_delete_removes_the_subtree(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $root = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $workspace->getKey(),
            'parent_id' => $root->getKey(),
        ]);
        $note = Note::factory()->create(['workspace_id' => $workspace->getKey(), 'folder_id' => $child->getKey()]);

        $this->actingAs($user)->deleteJson('/api/v1/folders/'.$root->getKey())->assertOk();
        $this->actingAs($user)->deleteJson('/api/v1/folders/'.$root->getKey().'/force')->assertOk();

        $this->assertDatabaseMissing('folders', ['id' => $root->getKey()]);
        $this->assertDatabaseMissing('folders', ['id' => $child->getKey()]);
        $this->assertDatabaseMissing('notes', ['id' => $note->getKey()]);
    }

    public function test_reorder_rewrites_sibling_positions(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $a = Folder::factory()->create(['workspace_id' => $workspace->getKey(), 'position' => 0]);
        $b = Folder::factory()->create(['workspace_id' => $workspace->getKey(), 'position' => 1]);

        $this->actingAs($user)->postJson('/api/v1/folders/reorder', [
            'ids' => [$b->getKey(), $a->getKey()],
        ])->assertOk();

        $this->assertSame(0, $b->refresh()->position);
        $this->assertSame(1, $a->refresh()->position);
    }

    public function test_reorder_rejects_ids_from_different_parents(): void
    {
        $user = User::factory()->create();
        $workspace = $this->workspaceFor($user);
        $root = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $workspace->getKey(),
            'parent_id' => $root->getKey(),
        ]);

        $this->actingAs($user)->postJson('/api/v1/folders/reorder', [
            'ids' => [$root->getKey(), $child->getKey()],
        ])->assertStatus(422);
    }
}
