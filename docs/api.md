# Xaveme API contract

Base path: `/api/v1`. Auth: Laravel Sanctum SPA cookie session (same origin), CSRF via `XSRF-TOKEN` cookie and `X-XSRF-TOKEN` header. Every response is JSON. Fetches send `Accept: application/json`.

## Envelope and errors

- Success: resource payloads are wrapped in `data` (Laravel API resource default). Collections add `meta` and `links` when paginated.
- Validation failure: `422` with `{ "message": string, "errors": { field: [string] } }`.
- Unauthenticated: `401` `{ "message": "Unauthenticated." }`.
- Forbidden: `403` `{ "message": string }`.
- Missing: `404`.
- Throttled: `429`.

## Identifiers and time

- All ids are ULIDs, strings, 26 chars. Foreign keys are `*_id` strings.
- Timestamps are ISO 8601 UTC strings.
- `position` is an integer rank, scoped to its sibling list. Reorder endpoints rewrite the whole sibling list in one call.

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | /register | name, email, password, password_confirmation | creates the user and signs in; throttled 6/min |
| POST | /login | email, password | throttled 6/min |
| POST | /logout | | destroys the session |
| GET | /me | | current user with `preferences` |

## Preferences

| Method | Path | Body |
|---|---|---|
| GET | /preferences | |
| PUT | /preferences | theme: light\|dark, palette: indigo\|teal\|amber\|rose\|violet\|graphite |

## Workspaces

| Method | Path | Body |
|---|---|---|
| GET | /workspaces | |
| POST | /workspaces | name |
| GET | /workspaces/{workspace} | |
| PATCH | /workspaces/{workspace} | name |
| DELETE | /workspaces/{workspace} | cascades folders, notes, attachments, tasks |
| GET | /workspaces/{workspace}/stats | counts and attachment bytes for the rail readout |
| POST | /workspaces/reorder | ids: string[] |

## Folders

Nested by `parent_id` (null = workspace root). Soft deleted by default, so destructive calls are recoverable until purged.

| Method | Path | Body / query |
|---|---|---|
| GET | /workspaces/{workspace}/folders | query: trashed=0\|1 |
| POST | /workspaces/{workspace}/folders | name, parent_id? |
| PATCH | /folders/{folder} | name?, parent_id? |
| DELETE | /folders/{folder} | soft deletes the subtree |
| POST | /folders/{folder}/restore | |
| DELETE | /folders/{folder}/force | permanent |
| POST | /folders/reorder | ids: string[] |

## Notes

`content` is plain text. When the vault is on the client sends an envelope instead and sets `encrypted: true`.

| Method | Path | Body / query |
|---|---|---|
| GET | /workspaces/{workspace}/notes | query: folder_id, q, sort=updated\|created\|title\|manual, trashed=0\|1, cursor |
| POST | /workspaces/{workspace}/notes | title?, content?, folder_id?, encrypted? |
| GET | /notes/{note} | |
| PATCH | /notes/{note} | title?, content?, folder_id?, encrypted? |
| DELETE | /notes/{note} | soft |
| POST | /notes/{note}/restore | |
| DELETE | /notes/{note}/force | |
| POST | /notes/reorder | ids: string[], folder_id? |

Search: `q` matches note title and content with LIKE, case insensitive, scoped to the workspace. Attachment name search lives on the attachments index with the same `q`.

## Attachments

Stored on the private disk, never in `public/`. Bytes are streamed through an authorized route. Uploads are allowlisted by extension and MIME and capped at 20 MB.

| Method | Path | Body / query |
|---|---|---|
| GET | /workspaces/{workspace}/attachments | query: folder_id, q, trashed=0\|1 |
| POST | /workspaces/{workspace}/attachments | multipart: file, folder_id?, encrypted? |
| GET | /attachments/{attachment} | metadata |
| GET | /attachments/{attachment}/download | streams with Content-Disposition attachment |
| GET | /attachments/{attachment}/preview | inline, images and PDF only |
| PATCH | /attachments/{attachment} | filename?, folder_id? |
| DELETE | /attachments/{attachment} | soft |
| POST | /attachments/{attachment}/restore | |
| DELETE | /attachments/{attachment}/force | |
| POST | /attachments/reorder | ids: string[], folder_id? |

## Tasks

| Method | Path | Body / query |
|---|---|---|
| GET | /workspaces/{workspace}/tasks | query: view=all\|today\|upcoming\|overdue\|done, folder_id, q |
| POST | /workspaces/{workspace}/tasks | title, notes?, folder_id?, due_at?, due_has_time?, priority? |
| PATCH | /tasks/{task} | any of title, notes, done, due_at, due_has_time, priority, folder_id |
| DELETE | /tasks/{task} | hard delete |
| POST | /tasks/reorder | ids: string[] |

`due_has_time` decides whether the pane prints a time or just a date. `done_at` is stamped when `done` flips true and cleared when it flips back.

## Trash

| Method | Path | Body / query |
|---|---|---|
| GET | /workspaces/{workspace}/trash | folders, notes, attachments, each with deleted_at |
| POST | /workspaces/{workspace}/trash/restore | type: folder\|note\|attachment, ids: string[] |
| DELETE | /workspaces/{workspace}/trash | purge everything in the workspace |
| DELETE | /workspaces/{workspace}/trash/{type}/{id} | purge one row |

## Vault

The passphrase never leaves the browser. The server stores only the derivation parameters and one sealed known string, and treats note content and attachment bytes as opaque.

| Method | Path | Body |
|---|---|---|
| GET | /vault | salt, iterations, check_iv, check_ct, configured: bool |
| PUT | /vault | salt, iterations, check_iv, check_ct |
| DELETE | /vault | removes the vault row; the client re-encrypts or keeps envelopes as-is |

Envelope format for encrypted content: `enc:v1:<base64(iv || ciphertext || tag)>`, AES-GCM 256, key derived with PBKDF2-SHA256 over the passphrase, per-vault salt, iteration count from the vault row. Known string: `notebook-vault-check-v1`.
