<?php

namespace Database\Factories;

use App\Models\Note;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Note>
 */
class NoteFactory extends Factory
{
    protected $model = Note::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'folder_id' => null,
            'title' => fake()->sentence(4),
            'content' => fake()->paragraph(),
            'encrypted' => false,
            'position' => 0,
        ];
    }
}
