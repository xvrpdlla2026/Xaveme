<?php

namespace App\Models;

use Database\Factories\FolderFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Folder extends Model
{
    /** @use HasFactory<FolderFactory> */
    use HasFactory, SoftDeletes;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'parent_id',
        'position',
    ];

    protected $attributes = [
        'position' => 0,
    ];

    protected static function booted(): void
    {
        static::creating(function (Folder $folder): void {
            if (empty($folder->getKey())) {
                $folder->setAttribute($folder->getKeyName(), (string) Str::ulid());
            }
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Workspace, $this> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return BelongsTo<Folder, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    /** @return HasMany<Folder, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_id');
    }

    /** @return HasMany<Note, $this> */
    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }

    /** @return HasMany<Attachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    /** @return HasMany<Task, $this> */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    /** @param Builder<Folder> $query */
    public function scopeOwnedBy(Builder $query, User $user): void
    {
        $query->whereHas('workspace', fn (Builder $workspace) => $workspace->where('user_id', $user->getKey()));
    }

    /**
     * Every folder below this one, at any depth.
     *
     * @return list<string>
     */
    public function descendantIds(): array
    {
        $ids = [];
        $frontier = [$this->getKey()];

        while ($frontier !== []) {
            // Soft deleted children still belong to the subtree, so the walk has
            // to see through the default scope.
            $children = static::withTrashed()
                ->whereIn('parent_id', $frontier)
                ->pluck('id')
                ->all();

            $children = array_values(array_diff($children, $ids));

            if ($children === []) {
                break;
            }

            $ids = array_merge($ids, $children);
            $frontier = $children;
        }

        return array_values(array_diff($ids, [$this->getKey()]));
    }
}