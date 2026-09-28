<?php

namespace Tests\Feature\Api;

use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskTest extends TestCase
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

    public function test_index_returns_workspace_tasks(): void
    {
        Task::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Mine']);
        Task::factory()->create(['title' => 'Theirs']);

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/workspaces/'.$this->workspace->getKey().'/tasks')
            ->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('Mine', $response->json('data.0.title'));
    }

    public function test_views_partition_tasks_by_due_date(): void
    {
        $overdue = Task::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'title' => 'Overdue',
            'due_at' => now()->subDays(3),
        ]);
        $today = Task::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'title' => 'Today',
            'due_at' => now()->endOfDay()->subMinute(),
        ]);
        $upcoming = Task::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'title' => 'Upcoming',
            'due_at' => now()->addWeek(),
        ]);
        $done = Task::factory()->create([
            'workspace_id' => $this->workspace->getKey(),
            'title' => 'Done',
            'due_at' => now()->subDay(),
            'done' => true,
        ]);
        Task::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Someday']);

        $url = '/api/v1/workspaces/'.$this->workspace->getKey().'/tasks?view=';

        $all = $this->actingAs($this->user)->getJson($url.'all')->assertOk();
        $this->assertCount(5, $all->json('data'));

        $todayRows = $this->actingAs($this->user)->getJson($url.'today')->assertOk()->json('data');
        $todayIds = array_column($todayRows, 'id');
        $this->assertCount(2, $todayIds);
        $this->assertContains($overdue->getKey(), $todayIds);
        $this->assertContains($today->getKey(), $todayIds);

        $upcomingRows = $this->actingAs($this->user)->getJson($url.'upcoming')->assertOk()->json('data');
        $this->assertSame([$upcoming->getKey()], array_column($upcomingRows, 'id'));

        $overdueRows = $this->actingAs($this->user)->getJson($url.'overdue')->assertOk()->json('data');
        $this->assertSame([$overdue->getKey()], array_column($overdueRows, 'id'));

        $doneRows = $this->actingAs($this->user)->getJson($url.'done')->assertOk()->json('data');
        $this->assertSame([$done->getKey()], array_column($doneRows, 'id'));
    }

    public function test_store_creates_a_task(): void
    {
        $due = now()->addDay()->startOfHour();

        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/tasks', [
            'title' => 'Ship it',
            'notes' => 'before friday',
            'due_at' => $due->toIso8601String(),
            'due_has_time' => true,
            'priority' => 2,
        ])->assertCreated()
            ->assertJsonPath('data.title', 'Ship it')
            ->assertJsonPath('data.notes', 'before friday')
            ->assertJsonPath('data.due_has_time', true)
            ->assertJsonPath('data.priority', 2)
            ->assertJsonPath('data.done', false)
            ->assertJsonPath('data.done_at', null);
    }

    public function test_store_requires_a_title(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/workspaces/'.$this->workspace->getKey().'/tasks', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('title');
    }

    public function test_done_flips_stamp_and_clear_done_at(): void
    {
        $task = Task::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $this->assertNull($task->done_at);

        $this->actingAs($this->user)->patchJson('/api/v1/tasks/'.$task->getKey(), ['done' => true])
            ->assertOk()
            ->assertJsonPath('data.done', true);

        $task->refresh();
        $this->assertTrue($task->done);
        $this->assertNotNull($task->done_at);

        $this->actingAs($this->user)->patchJson('/api/v1/tasks/'.$task->getKey(), ['done' => false])
            ->assertOk()
            ->assertJsonPath('data.done_at', null);

        $this->assertNull($task->refresh()->done_at);
    }

    public function test_update_changes_several_fields_at_once(): void
    {
        $task = Task::factory()->create(['workspace_id' => $this->workspace->getKey(), 'title' => 'Old']);
        $due = now()->addDays(2)->startOfHour();

        $response = $this->actingAs($this->user)->patchJson('/api/v1/tasks/'.$task->getKey(), [
            'title' => 'New',
            'notes' => 'details',
            'priority' => 3,
            'due_at' => $due->toIso8601String(),
            'due_has_time' => false,
        ])->assertOk();

        $response->assertJsonPath('data.title', 'New')
            ->assertJsonPath('data.notes', 'details')
            ->assertJsonPath('data.priority', 3)
            ->assertJsonPath('data.due_has_time', false);

        $this->assertNotNull($response->json('data.due_at'));
    }

    public function test_delete_is_a_hard_delete(): void
    {
        $task = Task::factory()->create(['workspace_id' => $this->workspace->getKey()]);

        $this->actingAs($this->user)->deleteJson('/api/v1/tasks/'.$task->getKey())->assertOk();

        $this->assertDatabaseMissing('tasks', ['id' => $task->getKey()]);
    }

    public function test_reorder_rewrites_positions(): void
    {
        $a = Task::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 0]);
        $b = Task::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 1]);

        $this->actingAs($this->user)->postJson('/api/v1/tasks/reorder', [
            'ids' => [$b->getKey(), $a->getKey()],
        ])->assertOk();

        $this->assertSame(0, $b->refresh()->position);
        $this->assertSame(1, $a->refresh()->position);
    }
}
