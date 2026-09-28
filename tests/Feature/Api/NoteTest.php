<?php

namespace Tests\Feature\Api;

use App\Models\Folder;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NoteTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->workspace = Workspace::factory()->create(['user_id' => $this->user->getKey()]);
    }

    public function test_index_returns_the_workspace_notes_with_pagination_meta(): void
    {
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'One']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Two']);
        Note::factory()->create(['title' => 'Elsewhere']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/workspaces/'.$this->workspace->getKey().'/notes')
            ->assertOk();

        $this->assertCount(2, $response->json('data'));
        $this->assertArrayHasKey('meta', $response->json());
        $this->assertArrayHasKey('links', $response->json());
    }

    public function test_index_filters_by_folder(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $inside = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'folder_id' => $folder->getKey()]);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $response = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/notes?folder_id='.$folder->getKey()
        )->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($inside->getKey(), $response->json('data.0.id'));
    }

    public function test_search_matches_title_and_content_case_insensitively(): void
    {
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Meeting notes', 'content' => 'nothing']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Groceries', 'content' => 'buy MEETING snacks']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Unrelated', 'content' => 'unrelated']);

        $response = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/notes?q=mEeTiNg'
        )->assertOk();

        $this->assertCount(2, $response->json('data'));
    }

    public function test_search_escapes_like_wildcards(): void
    {
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Discount 100% off']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Plain note']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Another note']);

        $response = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/notes?q=100%25'
        )->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Discount 100% off', $response->json('data.0.title'));
    }

    public function test_index_supports_the_title_sort(): void
    {
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'banana']);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Apple']);

        $response = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/notes?sort=title'
        )->assertOk();

        $this->assertSame('Apple', $response->json('data.0.title'));
        $this->assertSame('banana', $response->json('data.1.title'));
    }

    public function test_store_creates_a_note_and_assigns_a_position(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'folder_id' => $folder->getKey(), 'position' => 0]);

        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/notes', [
            'title' => 'Fresh',
            'content' => 'body text',
            'folder_id' => $folder->getKey(),
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Fresh')
            ->assertJsonPath('data.content', 'body text')
            ->assertJsonPath('data.folder_id', $folder->getKey())
            ->assertJsonPath('data.encrypted', false)
            ->assertJsonPath('data.position', 1);
    }

    public function test_store_accepts_an_encrypted_envelope(): void
    {
        $envelope = 'enc:v1:'.base64_encode(random_bytes(48));

        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/notes', [
            'title' => null,
            'content' => $envelope,
            'encrypted' => true,
        ])->assertCreated()
            ->assertJsonPath('data.encrypted', true)
            ->assertJsonPath('data.content', $envelope)
            ->assertJsonPath('data.title', '');
    }

    public function test_store_rejects_a_folder_from_another_workspace(): void
    {
        $other = Folder::factory()->create();

        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/notes', [
            'title' => 'Nope',
            'folder_id' => $other->getKey(),
        ])->assertStatus(422)->assertJsonValidationErrors('folder_id');
    }

    public function test_show_update_and_soft_delete_a_note(): void
    {
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Draft']);

        $this->actingAs($this->user)->getJson('/api/v1/notes/'.$note->getKey())
            ->assertOk()
            ->assertJsonPath('data.title', 'Draft');

        $this->actingAs($this->user)->patchJson('/api/v1/notes/'.$note->getKey(), [
            'title' => 'Final',
            'content' => 'done',
        ])->assertOk()
            ->assertJsonPath('data.title', 'Final')
            ->assertJsonPath('data.content', 'done');

        $this->actingAs($this->user)->deleteJson('/api/v1/notes/'.$note->getKey())->assertOk();
        $this->assertSoftDeleted('notes', ['id' => $note->getKey()]);

        $this->actingAs($this->user)->getJson('/api/v1/notes/'.$note->getKey())->assertNotFound();

        $this->actingAs($this->user)->postJson('/api/v1/notes/'.$note->getKey().'/restore')
            ->assertOk()
            ->assertJsonPath('data.deleted_at', null);
        $this->assertNull($note->refresh()->deleted_at);
    }

    public function test_force_delete_removes_the_row(): void
    {
        $note = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $this->actingAs($this->user)->deleteJson('/api/v1/notes/'.$note->getKey())->assertOk();
        $this->actingAs($this->user)->deleteJson('/api/v1/notes/'.$note->getKey().'/force')->assertOk();

        $this->assertDatabaseMissing('notes', ['id' => $note->getKey()]);
    }

    public function test_reorder_rewrites_positions_within_a_folder(): void
    {
        $a = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 0]);
        $b = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 1]);
        $c = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 2]);

        $this->actingAs($this->user)->postJson('/api/v1/notes/reorder', [
            'ids' => [$b->getKey(), $c->getKey(), $a->getKey()],
        ])->assertOk();

        $this->assertSame(0, $b->refresh()->position);
        $this->assertSame(1, $c->refresh()->position);
        $this->assertSame(2, $a->refresh()->position);
    }

    public function test_reorder_rejects_ids_from_a_different_folder(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $inside = Note::factory()->create(['workspace_id' => $this->workspace->getKey(), 'folder_id' => $folder->getKey()]);
        $outside = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $this->actingAs($this->user)->postJson('/api/v1/notes/reorder', [
            'ids' => [$inside->getKey(), $outside->getKey()],
        ])->assertStatus(422);
    }

    public function test_trashed_filter_returns_only_deleted_notes(): void
    {
        $live = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $dead = Note::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $dead->delete();

        $response = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/notes?trashed=1'
        )->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($dead->getKey(), $response->json('data.0.id'));
        $this->assertNotNull($response->json('data.0.deleted_at'));
    }
}
