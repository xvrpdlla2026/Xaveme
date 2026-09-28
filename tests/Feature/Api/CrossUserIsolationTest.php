<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\Note;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CrossUserIsolationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $intruder;

    private Workspace $workspace;

    private Folder $folder;

    private Note $note;

    private Attachment $attachment;

    private Task $task;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->intruder = User::factory()->create();

        $this->workspace = Workspace::factory()->create(['user_id' => $this->owner->getKey(), 'name' => 'Mine']);
        $this->folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $this->note = Note::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'folder_id' => $this->folder->getKey(),
        ]);
        $this->attachment = Attachment::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'folder_id' => $this->folder->getKey(),
        ]);
        $this->task = Task::factory()->create(['workspace_id' => $this->workspace->getKey()]);
    }

    /**
     * Another user's row must answer 403 or 404. Anything else, including a 500,
     * is a failure.
     */
    private function assertHidden(TestResponse $response): void
    {
        $this->assertContains(
            $response->getStatusCode(),
            [403, 404],
            'Expected 403 or 404, got '.$response->getStatusCode().' body: '.substr($response->getContent(), 0, 200)
        );
    }

    public function test_another_users_workspace_is_never_reachable(): void
    {
        $intruder = $this->intruder;
        $id = $this->workspace->getKey();

        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$id));
        $this->assertHidden($this->actingAs($intruder)->patchJson('/api/v1/workspaces/'.$id, ['name' => 'Taken']));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/workspaces/'.$id));
        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$id.'/stats'));

        $this->assertSame('Mine', $this->workspace->refresh()->name);
        $this->assertDatabaseHas('workspaces', ['id' => $id]);
    }

    public function test_another_users_workspace_never_appears_in_the_index(): void
    {
        $response = $this->actingAs($this->intruder)->getJson('/api/v1/workspaces')->assertOk();

        $this->assertSame([], $response->json('data'));
    }

    public function test_another_users_collections_are_never_returned(): void
    {
        $intruder = $this->intruder;
        $id = $this->workspace->getKey();

        foreach (['folders', 'notes', 'attachments', 'tasks', 'trash'] as $collection) {
            $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$id.'/'.$collection));
        }
    }

    public function test_another_users_folder_is_never_reachable(): void
    {
        $intruder = $this->intruder;
        $id = $this->folder->getKey();

        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/folders/'.$id));
        $this->assertHidden($this->actingAs($intruder)->patchJson('/api/v1/folders/'.$id, ['name' => 'Taken']));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/folders/'.$id));
        $this->assertHidden($this->actingAs($intruder)->postJson('/api/v1/folders/'.$id.'/restore'));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/folders/'.$id.'/force'));

        $this->assertDatabaseHas('folders', ['id' => $id, 'deleted_at' => null]);
    }

    public function test_another_users_note_is_never_reachable(): void
    {
        $intruder = $this->intruder;
        $id = $this->note->getKey();

        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/notes/'.$id));
        $this->assertHidden($this->actingAs($intruder)->patchJson('/api/v1/notes/'.$id, ['title' => 'Taken']));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/notes/'.$id));
        $this->assertHidden($this->actingAs($intruder)->postJson('/api/v1/notes/'.$id.'/restore'));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/notes/'.$id.'/force'));

        $this->assertDatabaseHas('notes', ['id' => $id, 'deleted_at' => null]);
    }

    public function test_another_users_attachment_is_never_reachable(): void
    {
        $intruder = $this->intruder;
        $id = $this->attachment->getKey();

        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/attachments/'.$id));
        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/attachments/'.$id.'/download'));
        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/attachments/'.$id.'/preview'));
        $this->assertHidden($this->actingAs($intruder)->patchJson('/api/v1/attachments/'.$id, ['filename' => 'taken.txt']));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/attachments/'.$id));
        $this->assertHidden($this->actingAs($intruder)->postJson('/api/v1/attachments/'.$id.'/restore'));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/attachments/'.$id.'/force'));

        $this->assertDatabaseHas('attachments', ['id' => $id, 'deleted_at' => null]);
    }

    public function test_another_users_task_is_never_reachable(): void
    {
        $intruder = $this->intruder;
        $id = $this->task->getKey();

        $this->assertHidden($this->actingAs($intruder)->getJson('/api/v1/tasks/'.$id));
        $this->assertHidden($this->actingAs($intruder)->patchJson('/api/v1/tasks/'.$id, ['title' => 'Taken']));
        $this->assertHidden($this->actingAs($intruder)->deleteJson('/api/v1/tasks/'.$id));

        $this->assertDatabaseHas('tasks', ['id' => $id]);
    }

    public function test_a_nested_write_rejects_a_folder_from_another_workspace(): void
    {
        $intruder = $this->intruder;
        $other = Workspace::factory()->create(['user_id' => $intruder->getKey()]);

        // The folder exists, but it belongs to a workspace this caller does not own.
        $this->actingAs($intruder)->postJson('/api/v1/workspaces/'.$other->getKey().'/notes', [
            'title' => 'Sneaky',
            'folder_id' => $this->folder->getKey(),
        ])->assertStatus(422)->assertJsonValidationErrors('folder_id');

        $this->assertDatabaseMissing('notes', ['title' => 'Sneaky']);
    }

    public function test_a_nested_route_verifies_the_child_belongs_to_the_workspace_in_the_path(): void
    {
        $intruder = $this->intruder;
        $other = Workspace::factory()->create(['user_id' => $intruder->getKey()]);
        Folder::factory()->create(['workspace_id' => $other->getKey()]);

        // The intruder owns $other, so the workspace check passes, but each
        // collection must still only expose that workspace's rows.
        $this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$other->getKey().'/notes')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$other->getKey().'/attachments')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($intruder)->getJson('/api/v1/workspaces/'.$other->getKey().'/tasks')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_owner_can_still_reach_every_row(): void
    {
        $owner = $this->owner;

        $this->actingAs($owner)->getJson('/api/v1/workspaces/'.$this->workspace->getKey())->assertOk();
        $this->actingAs($owner)->getJson('/api/v1/folders/'.$this->folder->getKey())->assertOk();
        $this->actingAs($owner)->getJson('/api/v1/notes/'.$this->note->getKey())->assertOk();
        $this->actingAs($owner)->getJson('/api/v1/attachments/'.$this->attachment->getKey())->assertOk();
        $this->actingAs($owner)->getJson('/api/v1/tasks/'.$this->task->getKey())->assertOk();
        $this->actingAs($owner)->getJson('/api/v1/workspaces/'.$this->workspace->getKey().'/notes')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_every_protected_endpoint_requires_authentication(): void
    {
        $workspace = $this->workspace->getKey();

        $this->getJson('/api/v1/workspaces')->assertStatus(401);
        $this->postJson('/api/v1/workspaces', ['name' => 'Nope'])->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace)->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace.'/folders')->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace.'/notes')->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace.'/attachments')->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace.'/tasks')->assertStatus(401);
        $this->getJson('/api/v1/workspaces/'.$workspace.'/trash')->assertStatus(401);
        $this->getJson('/api/v1/folders/'.$this->folder->getKey())->assertStatus(401);
        $this->getJson('/api/v1/notes/'.$this->note->getKey())->assertStatus(401);
        $this->getJson('/api/v1/attachments/'.$this->attachment->getKey())->assertStatus(401);
        $this->getJson('/api/v1/tasks/'.$this->task->getKey())->assertStatus(401);
        $this->getJson('/api/v1/vault')->assertStatus(401);
        $this->getJson('/api/v1/preferences')->assertStatus(401);
    }
}
