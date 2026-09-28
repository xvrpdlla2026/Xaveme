# Notebook

A notes app for people who keep everything in one place: workspaces, nested folders, notes,
file attachments, a task list, and a vault for the notes you do not want readable at rest.

Laravel serves a JSON API and the React single page app from the same origin, so sessions work
with cookies and there is no separate auth dance.

## Stack

- Laravel 12 on PHP 8.2, Sanctum session cookies for auth
- React 19 and TypeScript, built with Vite
- SQLite by default (the migrations are portable to MySQL or PostgreSQL)
- Plain CSS with a token layer: light and dark themes, six colour palettes

## Requirements

PHP 8.2 or newer with the `pdo_sqlite` and `zip` extensions, Composer, Node 20 or newer, npm.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
npm install
```

Then run the API and the asset server in two terminals:

```bash
php artisan serve
npm run dev
```

Open http://127.0.0.1:8000 and create an account. For a production build, `npm run build`
writes the compiled assets to `public/build` and `php artisan serve` picks them up.

To point the app at MySQL instead, set `DB_CONNECTION=mysql` and the `DB_*` values in `.env`
and run `php artisan migrate` again. Nothing in the application code is SQLite specific.

## Tests

```bash
php artisan test
```

The suite covers every endpoint group, the soft delete and purge paths, and a cross user
isolation test that proves one account can never read or write another account's rows.

## Layout

| Path | What lives there |
|---|---|
| `app/Http/Controllers/Api/V1` | one controller per resource |
| `app/Http/Requests` | validation for every write |
| `app/Policies` | ownership rules, checked on every action |
| `resources/js/api` | typed client, one module per resource |
| `resources/js/components` | the shell, the tree and the editor |
| `resources/js/panes` | tasks, trash, attachments, settings and the vault gate |
| `resources/css` | design tokens, then the component layers |
| `docs/api.md` | the endpoint contract the frontend is written against |

## The vault

Encryption happens in the browser. The passphrase is stretched with PBKDF2-SHA256 using a salt
stored beside the data, and note content is sealed with AES-GCM into an `enc:v1:` envelope
before it is ever sent. The server stores the envelope, the salt, the iteration count and one
sealed known string it can neither read nor forge. Losing the passphrase means losing those
notes, by design.

## Attachments

Uploads are validated against both an extension and a MIME allowlist and capped in size, then
written to the private disk. They are streamed back through an authorized route, so a file is
never readable without a session that owns it.

## License

MIT.
