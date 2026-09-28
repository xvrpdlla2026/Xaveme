<?php

namespace Database\Factories;

use App\Models\Attachment;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Attachment>
 */
class AttachmentFactory extends Factory
{
    protected $model = Attachment::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'folder_id' => null,
            'filename' => fake()->word().'.txt',
            'path' => 'attachments/fake/'.Str::ulid().'.txt',
            'mime_type' => 'text/plain',
            'size' => 128,
            'encrypted' => false,
            'position' => 0,
        ];
    }
}
