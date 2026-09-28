<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Folder;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AttachmentTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->user = User::factory()->create();
        $this->workspace = Workspace::factory()->create(['user_id' => $this->user->getKey()]);
    }

    private function upload(string $name = 'report.txt', string $mime = 'text/plain', ?string $folderId = null)
    {
        return $this->actingAs($this->user)->postJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments',
            array_filter([
                'file' => UploadedFile::fake()->create($name, 4, $mime),
                'folder_id' => $folderId,
            ], fn ($value) => $value !== null)
        );
    }

    public function test_upload_stores_bytes_on_the_private_disk(): void
    {
        $response = $this->upload();

        $response->assertCreated()
            ->assertJsonPath('data.filename', 'report.txt')
            ->assertJsonPath('data.mime_type', 'text/plain')
            ->assertJsonPath('data.size', 4096);

        $id = $response->json('data.id');
        $this->assertNotNull($id);

        Storage::disk('local')->assertExists('attachments/'.$this->workspace->getKey().'/'.$id.'.txt');
        Storage::disk('public')->assertMissing('attachments/'.$this->workspace->getKey().'/'.$id.'.txt');

        $this->assertDatabaseHas('attachments', [
            'id' => $id,
            'workspace_id' => $this->workspace->getKey(),
            'path' => 'attachments/'.$this->workspace->getKey().'/'.$id.'.txt',
        ]);
    }

    public function test_upload_rejects_a_disallowed_extension(): void
    {
        $this->actingAs($this->user)->postJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments',
            ['file' => UploadedFile::fake()->create('payload.exe', 4, 'application/octet-stream')]
        )->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_upload_rejects_a_mismatched_mime_type(): void
    {
        $this->actingAs($this->user)->postJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments',
            ['file' => UploadedFile::fake()->create('photo.png', 4, 'application/pdf')]
        )->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_upload_rejects_a_file_over_twenty_megabytes(): void
    {
        $this->actingAs($this->user)->postJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments',
            ['file' => UploadedFile::fake()->create('huge.pdf', 20481, 'application/pdf')]
        )->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_index_filters_by_folder_and_searches_the_filename(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $this->upload('budget.txt', 'text/plain', $folder->getKey())->assertCreated();
        $this->upload('holiday.txt')->assertCreated();

        $byFolder = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments?folder_id='.$folder->getKey()
        )->assertOk();

        $this->assertCount(1, $byFolder->json('data'));
        $this->assertSame('budget.txt', $byFolder->json('data.0.filename'));

        $found = $this->actingAs($this->user)->getJson(
            '/api/v1/workspaces/'.$this->workspace->getKey().'/attachments?q=BUDGET'
        )->assertOk();

        $this->assertCount(1, $found->json('data'));
        $this->assertSame('budget.txt', $found->json('data.0.filename'));
    }

    public function test_download_streams_the_bytes_as_an_attachment(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');

        $response = $this->actingAs($this->user)->get('/api/v1/attachments/'.$id.'/download');

        $response->assertOk();
        $this->assertStringContainsString('attachment', (string) $response->headers->get('content-disposition'));
        $this->assertStringContainsString('report.txt', (string) $response->headers->get('content-disposition'));
    }

    public function test_preview_is_inline_for_images_and_pdfs(): void
    {
        $image = $this->upload('shot.png', 'image/png')->assertCreated()->json('data.id');

        $response = $this->actingAs($this->user)->get('/api/v1/attachments/'.$image.'/preview');
        $response->assertOk();
        $this->assertStringContainsString('inline', (string) $response->headers->get('content-disposition'));

        $pdf = $this->upload('doc.pdf', 'application/pdf')->assertCreated()->json('data.id');
        $this->actingAs($this->user)->get('/api/v1/attachments/'.$pdf.'/preview')->assertOk();
    }

    public function test_preview_is_refused_for_a_plain_text_file(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');

        $this->actingAs($this->user)->get('/api/v1/attachments/'.$id.'/preview')->assertNotFound();
    }

    public function test_metadata_update_moves_the_attachment_to_another_folder(): void
    {
        $folder = Folder::factory()->create(['workspace_id' => $this->workspace->getKey()]);
        $id = $this->upload()->assertCreated()->json('data.id');

        $this->actingAs($this->user)->patchJson('/api/v1/attachments/'.$id, [
            'filename' => 'renamed.txt',
            'folder_id' => $folder->getKey(),
        ])->assertOk()
            ->assertJsonPath('data.filename', 'renamed.txt')
            ->assertJsonPath('data.folder_id', $folder->getKey());
    }

    public function test_soft_delete_keeps_the_file_and_restore_returns_the_row(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');
        $path = 'attachments/'.$this->workspace->getKey().'/'.$id.'.txt';

        $this->actingAs($this->user)->deleteJson('/api/v1/attachments/'.$id)->assertOk();
        $this->assertSoftDeleted('attachments', ['id' => $id]);
        Storage::disk('local')->assertExists($path);

        $this->actingAs($this->user)->postJson('/api/v1/attachments/'.$id.'/restore')
            ->assertOk()
            ->assertJsonPath('data.deleted_at', null);
    }

    public function test_force_delete_removes_the_row_and_the_file(): void
    {
        $id = $this->upload()->assertCreated()->json('data.id');
        $path = 'attachments/'.$this->workspace->getKey().'/'.$id.'.txt';

        $this->actingAs($this->user)->deleteJson('/api/v1/attachments/'.$id)->assertOk();
        $this->actingAs($this->user)->deleteJson('/api/v1/attachments/'.$id.'/force')->assertOk();

        $this->assertDatabaseMissing('attachments', ['id' => $id]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_reorder_rewrites_positions(): void
    {
        $a = Attachment::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 0]);
        $b = Attachment::factory()->create(['workspace_id' => $this->workspace->getKey(), 'position' => 1]);

        $this->actingAs($this->user)->postJson('/api/v1/attachments/reorder', [
            'ids' => [$b->getKey(), $a->getKey()],
        ])->assertOk();

        $this->assertSame(0, $b->refresh()->position);
        $this->assertSame(1, $a->refresh()->position);
    }
}
