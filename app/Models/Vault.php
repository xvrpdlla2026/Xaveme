<?php

namespace App\Models;

use Database\Factories\VaultFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Vault extends Model
{
    /** @use HasFactory<VaultFactory> */
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'salt',
        'iterations',
        'check_iv',
        'check_ct',
    ];

    protected static function booted(): void
    {
        static::creating(function (Vault $vault): void {
            if (empty($vault->getKey())) {
                $vault->setAttribute($vault->getKeyName(), (string) Str::ulid());
            }
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'iterations' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
