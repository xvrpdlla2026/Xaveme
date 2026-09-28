<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkspaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_returns_only_the_callers_workspaces(): void
    {
        $user = User::factory()->create();
        $mine = Workspace::factory()->create(['user_id' => $user->getKey(), 'name' => 'Mine']);
        Workspace::factory()->create(['name' => 'Theirs']);

        $response = $this->actingAs($user)->getJson('/api/v1/workspaces')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($mine->getKey(), $response->json('data.0.id'));
        $this->assertSame('Mine', $response->json('data.0.name'));
    }

    public function test_store_creates_a_workspace_with_a_position(): void
    {
        $user = User::factory()->create();
        Workspace::factory()->create(['user_id' => $user->getKey(), 'position' => 0]);

        $response = $this->actingAs($user)->postJson('/api/v1/workspaces', ['name' => 'Research'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Research')
            ->assertJsonPath('data.position', 1);

        $this->assertDatabaseHas('workspaces', [
            'id' => $response->json('data.id'),
            'user_id' => $user->getKey(),
        ]);
    }

    public function test_store_requires_a_name(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/workspaces', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_show_and_update_a_workspace(): void
    {
        $user = User::factory()->create();
        $workspace = Workspace::factory()->create(['user_id' => $user->getKey()]);

        $this->actingAs($user)->getJson('/api/v1/workspaces/'.$workspace->getKey())
            ->assertOk()
            ->assertJsonPath('data.id', $workspace->getKey());

        $this->actingAs($user)->patchJson('/api/v1/workspaces/'.$workspace->getKey(), ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed');

        $this->assertDatabaseHas('workspaces', ['id' => $workspace->getKey(), 'name' => 'Renamed']);
    }

    public function test_stats_counts_rows_and_attachment_bytes(): void
    {
        $user = User::factory()->create();
        $workspace = Workspace::factory()->create(['user_id' => $user->getKey()]);

        Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        Note::factory()->count(2)->create(['workspace_id' => $workspace->getKey()]);
        Task::factory()->create(['workspace_id' => $workspace->getKey(), 'done' => true]);
        Attachment::factory()->create(['workspace_id' => $workspace->getKey(), 'size' => 300]);

        $this->actingAs($user)->getJson('/api/v1/workspaces/'.$workspace->getKey().'/stats')
            ->assertOk()
            ->assertJsonPath('data.folders', 1)
            ->assertJsonPath('data.notes', 2)
            ->assertJsonPath('data.tasks', 1)
            ->assertJsonPath('data.attachments', 1)
            ->assertJsonPath('data.attachment_bytes', 300);
    }

    public function test_destroy_cascades_children(): void
    {
        $user = User::factory()->create();
        $workspace = Workspace::factory()->create(['user_id' => $user->getKey()]);

        $folder = Folder::factory()->create(['workspace_id' => $workspace->getKey()]);
        Note::factory()->create(['workspace_id' => $workspace->getKey(), 'folder_id' => $folder->getKey()]);
        Attachment::factory()->create(['workspace_id' => $workspace->getKey()]);
        Task::factory()->create(['workspace_id' => $workspace->getKey()]);

        $this->actingAs($user)->deleteJson('/api/v1/workspaces/'.$workspace->getKey())->assertOk();

        $this->assertDatabaseMissing('workspaces', ['id' => $workspace->getKey()]);
        $this->assertDatabaseMissing('folders', ['id' => $folder->getKey()]);
        $this->assertSame(0, Note::withTrashed()->count());
        $this->assertSame(0, Attachment::withTrashed()->count());
        $this->assertSame(0, Task::count());
    }

    public function test_reorder_rewrites_positions_in_the_given_order(): void
    {
        $user = User::factory()->create();
        $a = Workspace::factory()->create(['user_id' => $user->getKey(), 'position' => 0]);
        $b = Workspace::factory()->create(['user_id' => $user->getKey(), 'position' => 1]);
        $c = Workspace::factory()->create(['user_id' => $user->getKey(), 'position' => 2]);

        $this->actingAs($user)->postJson('/api/v1/workspaces/reorder', [
            'ids' => [$c->getKey(), $a->getKey(), $b->getKey()],
        ])->assertOk();

        $this->assertSame(0, $c->refresh()->position);
        $this->assertSame(1, $a->refresh()->position);
        $this->assertSame(2, $b->refresh()->position);

        $this->actingAs($user)->getJson('/api/v1/workspaces')
            ->assertOk()
            ->assertJsonPath('data.0.id', $c->getKey());
    }

    public function test_reorder_rejects_another_users_workspace(): void
    {
        $user = User::factory()->create();
        $mine = Workspace::factory()->create(['user_id' => $user->getKey()]);
        $theirs = Workspace::factory()->create();

        $this->actingAs($user)->postJson('/api/v1/workspaces/reorder', [
            'ids' => [$mine->getKey(), $theirs->getKey()],
        ])->assertStatus(404);
    }
}
