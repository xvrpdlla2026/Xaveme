<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class TrashTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->user = User::factory()->create();
        $this->workspace = Workspace::factory()->create(['user_id' => $this->user->getKey()]);
    }

    public function test_index_lists_the_three_trashed_collections_with_deleted_at(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $attachment = Attachment::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $folder->delete();
        $note->delete();
        $attachment->delete();

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/workspaces/'.$this->workspace->getKey().'/trash')
            ->assertOk();

        $this->assertCount(1, $response->json('data.folders'));
        $this->assertCount(1, $response->json('data.notes'));
        $this->assertCount(1, $response->json('data.attachments'));
        $this->assertSame($folder->getKey(), $response->json('data.folders.0.id'));
        $this->assertSame($note->getKey(), $response->json('data.notes.0.id'));
        $this->assertSame($attachment->getKey(), $response->json('data.attachments.0.id'));
        $this->assertNotNull($response->json('data.notes.0.deleted_at'));
    }

    public function test_restore_brings_back_the_requested_rows(): void
    {
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $other = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $note->delete();
        $other->delete();

        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/trash/restore', [
            'type' => 'note',
            'ids' => [$note->getKey()],
        ])->assertOk()->assertJsonPath('data.restored', 1);

        $this->assertNull($note->refresh()->deleted_at);
        $this->assertNotNull($other->refresh()->deleted_at);
    }

    public function test_restore_rejects_an_unknown_type(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/trash/restore', [
            'type' => 'workspace',
            'ids' => [(string) Str::ulid()],
        ])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_purge_one_folder_removes_the_subtree_and_its_files(): void
    {
        $root = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $child = Folder::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'parent_id' => $root->getKey(),
        ]);
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'folder_id' => $child->getKey()]);

        $path = 'attachments/'.$this->workspace->getKey().'/'.Str::ulid().'.txt';
        Storage::disk('local')->put($path, 'bytes');
        $attachment = Attachment::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'folder_id' => $child->getKey(),
            'path' => $path,
        ]);

        $this->actingAs($this->user)->deleteJson('/api/v1/folders/'.$root->getKey())->assertOk();

        $this->actingAs($this->user)->deleteJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/trash/folder/'.$root->getKey()
        )->assertOk();

        $this->assertDatabaseMissing('folders', ['id' => $root->getKey()]);
        $this->assertDatabaseMissing('folders', ['id' => $child->getKey()]);
        $this->assertDatabaseMissing('notes', ['id' => $note->getKey()]);
        $this->assertDatabaseMissing('attachments', ['id' => $attachment->getKey()]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_purge_empties_the_whole_trash(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $attachment = Attachment::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $live = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $folder->delete();
        $note->delete();
        $attachment->delete();

        $this->actingAs($this->user)->deleteJson('/api/v1/workspaces/'.$this->workspace->getKey().'/trash')
            ->assertOk();

        $this->assertDatabaseMissing('folders', ['id' => $folder->getKey()]);
        $this->assertDatabaseMissing('notes', ['id' => $note->getKey()]);
        $this->assertDatabaseMissing('attachments', ['id' => $attachment->getKey()]);
        $this->assertDatabaseHas('notes', ['id' => $live->getKey()]);

        $this->actingAs($this->user)->getJson('/api/v1/workspaces/'.$this->workspace->getKey().'/trash')
            ->assertOk()
            ->assertJsonCount(0, 'data.folders')
            ->assertJsonCount(0, 'data.notes')
            ->assertJsonCount(0, 'data.attachments');
    }

    public function test_purge_one_returns_not_found_for_a_live_row(): void
    {
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $this->actingAs($this->user)->deleteJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/trash/note/'.$note->getKey()
        )->assertNotFound();

        $this->assertDatabaseHas('notes', ['id' => $note->getKey()]);
    }
}
