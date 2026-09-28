/**
 * lib/format.ts: byte sizes, dates and file badges.
 *
 * The rules match the reference app: sizes stay under four significant characters, a date
 * inside a week is relative and a date beyond it is absolute, and a file row is marked by
 * a short type pill rather than an icon, because the type is what a list of attachments
 * is scanned for.
 */

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/** "820 B", "1.4 KB", "12 MB". Never negative, never NaN. */
export function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return Math.round(value) + ' B';
  let n = value;
  let unit = 0;
  do {
    n /= 1024;
    unit += 1;
  } while (n >= 1024 && unit < BYTE_UNITS.length - 1);
  const label = BYTE_UNITS[unit] ?? 'TB';
  return (n < 10 ? n.toFixed(1) : String(Math.round(n))) + ' ' + label;
}

/** A short stamp for a row: "just now", "4m ago", "3d ago", then an absolute date. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso);
  const time = then.getTime();
  if (!Number.isFinite(time)) return '';

  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days < 7) return days + 'd ago';
  return formatAbsolute(iso);
}

/** The full date: "12 Mar 2026". Reached through the two formatters below. */
function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The date and the time: "12 Mar 2026, 14:05". Used by the editor readout. */
export function formatStamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return formatAbsolute(iso) + ', ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** The clock time on its own, for the editor's saved indicator. */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A short uppercase badge for a file row: IMG, PDF, MD, TXT, DOC, CSV, JSON, FILE. */
export function extensionBadge(filename: string, mime?: string | null): string {
  const type = (mime ?? '').toLowerCase();
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
  if (type.startsWith('image/')) return 'IMG';
  if (type === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (ext === 'md' || type === 'text/markdown') return 'MD';
  if (ext === 'txt' || type.startsWith('text/')) return 'TXT';
  if (ext === 'doc' || ext === 'docx') return 'DOC';
  if (ext === 'csv') return 'CSV';
  if (ext === 'json') return 'JSON';
  if (ext === 'zip') return 'ZIP';
  return 'FILE';
}

/**
 * Whether a mime type can be shown inline by the browser.
 *
 * Exported for the attachment pane, which is the one place that decides between a preview and
 * a download link. Nothing in this file calls it.
 */
export function isPreviewableMime(mime: string | null | undefined): boolean {
  const type = (mime ?? '').toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf';
}

/** A note with no title still needs a name on screen. */
export function noteTitle(note: { title: string }): string {
  const trimmed = note.title.trim();
  return trimmed ? trimmed : 'Untitled note';
}

/** The one-line excerpt a card or a search result shows under its title. */
export function noteSnippet(note: { content: string; encrypted: boolean }): string {
  if (note.encrypted && note.content.startsWith('enc:v1:')) return 'Encrypted note';
  const text = note.content.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 140) : 'Empty note';
}

/** The first letter of a name, for an avatar-less initial. */
export function initial(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}
