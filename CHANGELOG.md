# Changelog

Every release of Xave, newest first.

## [1.0.0] - 2026-09-28

The first release. What it holds, and what stable means here.

- **Accounts.** Every row belongs to one account. Workspaces, folders, notes, files, tasks and
  the vault row are scoped to the signed-in user, and no request can reach another account's
  data. Sign up, sign in, sign out.
- **Workspaces and folders.** Nested to any depth, moved by drag or by menu, ordered by hand or
  by name and date, with a trash that holds everything until it is purged.
- **Notes.** Autosaved titles and bodies. A sealed body is opened in the browser before the
  editor is given it, and the write path refuses to seal an envelope a second time.
- **Files.** Attached to a folder or a note, streamed back through an authorized route, and
  previewed inline when the browser can render the type.
- **Tasks.** A per-workspace list with priority, due dates and a done state.
- **The vault.** Note bodies sealed in the browser with AES-GCM, the key derived from a
  passphrase the server never sees. The server keeps ciphertext, the parameters, and one sealed
  check value it can neither read nor forge.
- **Search.** One search across every workspace the account owns, from the header, with each hit
  naming the workspace it came from.
- **Presentation.** Light and dark, six palettes, and one token layer under the rail, the tree,
  the pane and the preview.

Stability: the API suite covers every endpoint group, the soft-delete and purge paths, and
cross-account isolation (`php artisan test`). The sign-in screen, the pane and the dialogs are
driven end to end in a real browser before each release.
