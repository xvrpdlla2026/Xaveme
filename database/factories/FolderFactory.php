<?php

namespace Database\Factories;

use App\Models\Folder;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Folder>
 */
class FolderFactory extends Factory
{
    protected $model = Folder::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'parent_id' => null,
            'name' => fake()->words(2, true),
            'position' => 0,
        ];
    }

    public function childOf(Folder $parent): static
    {
        return $this->state(fn (): array => [
            'workspace_id' => $parent->workspace_id,
            'parent_id' => $parent->getKey(),
        ]);
    }
}
