<?php

namespace Database\Factories;

use App\Models\Task;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    protected $model = Task::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'folder_id' => null,
            'title' => fake()->sentence(3),
            'notes' => null,
            'done' => false,
            'done_at' => null,
            'due_at' => null,
            'due_has_time' => false,
            'priority' => 0,
            'position' => 0,
        ];
    }
}
