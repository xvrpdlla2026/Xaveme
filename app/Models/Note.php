<?php

namespace App\Models;

use Database\Factories\NoteFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Note extends Model
{
    /** @use HasFactory<NoteFactory> */
    use HasFactory, SoftDeletes;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'title',
        'content',
        'folder_id',
        'encrypted',
        'position',
    ];

    protected $attributes = [
        'title' => '',
        'encrypted' => false,
        'position' => 0,
    ];

    protected static function booted(): void
    {
        static::creating(function (Note $note): void {
            if (empty($note->getKey())) {
                $note->setAttribute($note->getKeyName(), (string) Str::ulid());
            }
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'encrypted' => 'boolean',
            'position' => 'integer',
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