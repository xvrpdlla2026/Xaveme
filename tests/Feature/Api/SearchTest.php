<?php

namespace Tests\Feature\Api;

use App\Models\Attachment;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SearchTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Workspace $first;

    private Workspace $second;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        // Position is unique per account: two workspaces have to be numbered, exactly as the
        // create endpoint numbers them.
        $this->first = Workspace::factory()->create([
            'user_id' => $this->user->getKey(),
            'name' => 'First',
            'position' => 0,
        ]);
        $this->second = Workspace::factory()->create([
            'user_id' => $this->user->getKey(),
            'name' => 'Second',
            'position' => 1,
        ]);
    }

    public function test_it_reaches_notes_in_every_workspace_of_the_account(): void
    {
        Note::factory()->create(['workspace_id' => $this->first->getKey(), 'title' => 'Quarterly report']);
        Note::factory()->create(['workspace_id' => $this->second->getKey(), 'title' => 'Quarterly budget']);
        Note::factory()->create(['workspace_id' => $this->second->getKey(), 'title' => 'Groceries']);

        $response = $this->actingAs($this->user)->getJson('/api/v1/search?q=quarterly')->assertOk();

        $this->assertCount(2, $response->json('data.notes'));
        $this->assertSame('First', $response->json('data.notes.0.workspace_name'));
        $this->assertNotEmpty($response->json('data.notes.1.workspace_name'));
    }

    public function test_it_matches_note_text_as_well_as_titles(): void
    {
        Note::factory()->create([
            'workspace_id' => $this->second->getKey(),
            'title' => 'Untitled',
            'content' => 'the quick brown fox',
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/v1/search?q=brown')->assertOk();

        $this->assertCount(1, $response->json('data.notes'));
    }

    public function test_it_matches_file_names_and_names_their_workspace(): void
    {
        Attachment::factory()->create([
            'workspace_id' => $this->second->getKey(),
            'filename' => 'quarterly-report.pdf',
        ]);
        Attachment::factory()->create(['workspace_id' => $this->first->getKey(), 'filename' => 'holiday.jpg']);

        $response = $this->actingAs($this->user)->getJson('/api/v1/search?q=quarterly')->assertOk();

        $this->assertCount(1, $response->json('data.files'));
        $this->assertSame('Second', $response->json('data.files.0.workspace_name'));
    }

    public function test_it_never_returns_another_accounts_rows(): void
    {
        $stranger = User::factory()->create();
        $theirs = Workspace::factory()->create(['user_id' => $stranger->getKey()]);
        Note::factory()->create(['workspace_id' => $theirs->getKey(), 'title' => 'Quarterly secret']);
        Attachment::factory()->create(['workspace_id' => $theirs->getKey(), 'filename' => 'quarterly-secret.pdf']);

        $response = $this->actingAs($this->user)->getJson('/api/v1/search?q=quarterly')->assertOk();

        $this->assertCount(0, $response->json('data.notes'));
        $this->assertCount(0, $response->json('data.files'));
    }

    public function test_it_leaves_trashed_rows_out(): void
    {
        $note = Note::factory()->create(['workspace_id' => $this->first->getKey(), 'title' => 'Quarterly report']);
        $note->delete();

        $response = $this->actingAs($this->user)->getJson('/api/v1/search?q=quarterly')->assertOk();

        $this->assertCount(0, $response->json('data.notes'));
    }

    public function test_a_search_without_a_term_is_rejected(): void
    {
        $this->actingAs($this->user)->getJson('/api/v1/search')->assertStatus(422);
    }

    public function test_it_requires_a_session(): void
    {
        $this->getJson('/api/v1/search?q=anything')->assertUnauthorized();
    }
}
