<?php

namespace App\Models;

use Database\Factories\AttachmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Attachment extends Model
{
    /** @use HasFactory<AttachmentFactory> */
    use HasFactory, SoftDeletes;

    /**
     * The extension and MIME pairs an upload may use. The two must agree.
     *
     * @var array<string, list<string>>
     */
    public const ALLOWED_TYPES = [
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'png' => ['image/png'],
        'gif' => ['image/gif'],
        'webp' => ['image/webp'],
        'pdf' => ['application/pdf'],
        'txt' => ['text/plain'],
        'md' => ['text/markdown', 'text/plain', 'text/x-markdown'],
        'csv' => ['text/csv', 'text/plain', 'application/csv'],
        'json' => ['application/json', 'text/plain'],
        'zip' => ['application/zip', 'application/x-zip-compressed'],
        'doc' => ['application/msword'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        'xls' => ['application/vnd.ms-excel'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        'ppt' => ['application/vnd.ms-powerpoint'],
        'pptx' => ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        'odt' => ['application/vnd.oasis.opendocument.text'],
        'ods' => ['application/vnd.oasis.opendocument.spreadsheet'],
        'mp3' => ['audio/mpeg'],
        'wav' => ['audio/wav', 'audio/x-wav'],
        'mp4' => ['video/mp4'],
        'webm' => ['video/webm'],
    ];

    public const MAX_BYTES = 20971520;

    /** @var list<string> */
    public const PREVIEW_MIMES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'filename',
        'path',
        'mime_type',
        'size',
        'folder_id',
        'encrypted',
        'position',
    ];

    protected $attributes = [
        'encrypted' => false,
        'position' => 0,
    ];

    protected static function booted(): void
    {
        static::creating(function (Attachment $attachment): void {
            if (empty($attachment->getKey())) {
                $attachment->setAttribute($attachment->getKeyName(), (string) Str::ulid());
            }
        });
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'size' => 'integer',
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

    public function isPreviewable(): bool
    {
        return in_array($this->mime_type, self::PREVIEW_MIMES, true);
    }

    /**
     * Remove the stored bytes. Safe to call when the file is already gone.
     */
    public function deleteStoredFile(): void
    {
        if (! $this->path) {
            return;
        }

        $disk = Storage::disk('local');

        if ($disk->exists($this->path)) {
            $disk->delete($this->path);
        }
    }
}