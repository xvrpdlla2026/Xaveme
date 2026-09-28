<?php

namespace App\Models;

use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'title',
        'notes',
        'done',
        'done_at',
        'due_at',
        'due_has_time',
        'priority',
        'folder_id',
        'position',
    ];

    protected $attributes = [
        'done' => false,
        'due_has_time' => false,
        'priority' => 0,
        'position' => 0,
    ];

    protected static function booted(): void
    {
        static::creating(function (Task $task): void {
            if (empty($task->getKey())) {
                $task->setAttribute($task->getKeyName(), (string) Str::ulid());
            }
        });

        // done_at mirrors the done flag so the panes can sort without guessing.
        static::saving(function (Task $task): void {
            if (! $task->isDirty('done')) {
                return;
            }

            $task->done_at = $task->done ? ($task->done_at ?? now()) : null;
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'done' => 'boolean',
            'due_has_time' => 'boolean',
            'priority' => 'integer',
            'position' => 'integer',
            'done_at' => 'datetime',
            'due_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workspace, $this> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return BelongsTo<Folder, $this> */
    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }
}