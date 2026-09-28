/**
 * types.ts: the domain types this SPA works in.
 *
 * They mirror the API contract in docs/api.md. Every id is the server's ULID string, and
 * every timestamp is an ISO 8601 string in UTC, so nothing here is parsed into a Date on
 * the way in: the formatting layer decides how a stamp is shown, and the raw string is
 * what a payload sends back.
 */

/** The two themes the API accepts. */
export type Theme = 'light' | 'dark';

/** The six palettes the API accepts. 'indigo' is the default and needs no attribute. */
export type Palette = 'indigo' | 'teal' | 'amber' | 'rose' | 'violet' | 'graphite';

/** The sort keys the notes index honours. */
export type SortKey = 'updated' | 'created' | 'title' | 'manual';

/** Which way a sorted list runs. */
export type SortDirection = 'asc' | 'desc';

/** A sort choice: the key, and the direction it runs in. */
export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** The signed-in user, as GET /me returns it. */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Present on GET /me. Absent on the register and login payloads. */
  preferences?: Preferences;
}

/** Per-user display settings. */
export interface Preferences {
  theme: Theme;
  palette: Palette;
}

/** A workspace is the top of the tree: folders, notes and tasks all belong to one. */
export interface Workspace {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** The workspace readout in the rail footer. */
export interface WorkspaceStats {
  notes: number;
  folders: number;
  attachments: number;
  tasks?: number;
  /** Total attachment bytes. Optional: a server that predates the field omits it. */
  attachment_bytes?: number;
  /** Present only when the count endpoint adds an open-work figure. */
  open_tasks?: number;
}

/** A folder. parent_id null means it sits at the workspace root. */
export interface Folder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** A note. content is plain text, or an enc:v1: envelope when the vault sealed it. */
export interface Note {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  content: string;
  encrypted: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** An attachment: metadata only. The bytes are streamed from the download route. */
export interface Attachment {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  filename: string;
  mime_type: string;
  size: number;
  encrypted: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/** How urgent a task is. */
export type TaskPriority = 'low' | 'normal' | 'high';

/** The task list's views. */
export type TaskView = 'all' | 'today' | 'upcoming' | 'overdue' | 'done';

/** A task. due_has_time decides whether the pane prints a time or just a date. */
export interface Task {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  notes: string | null;
  done: boolean;
  due_at: string | null;
  due_has_time: boolean;
  priority: TaskPriority;
  done_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

/** The three things the trash holds. */
export type TrashType = 'folder' | 'note' | 'attachment';

/** One trashed row. The three lists share this shape so the panel can render them alike. */
export interface TrashRow {
  id: string;
  name: string;
  deleted_at: string | null;
}

/** GET /workspaces/{workspace}/trash. */
export interface TrashContents {
  folders: TrashRow[];
  notes: TrashRow[];
  attachments: TrashRow[];
}

/** The vault's derivation parameters and its sealed known string. */
export interface Vault {
  salt: string;
  iterations: number;
  check_iv: string;
  check_ct: string;
  configured: boolean;
}

/** A Laravel paginator payload. Collections hand this back instead of a bare array. */
export interface Paginated<T> {
  data: T[];
  links?: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    path?: string;
  };
}

/** A page of rows, in the one shape the client normalises every list into. */
export interface Paged<T> {
  items: T[];
  /** The cursor to ask for the next page with, or null when this is the last one. */
  nextCursor: string | null;
  /** The total the server reported, when it reported one. */
  total: number | null;
}
