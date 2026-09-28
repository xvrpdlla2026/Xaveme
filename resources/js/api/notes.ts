/**
 * api/notes.ts: notes, their search and sort query, and their order.
 *
 * A note's content is plain text unless the vault sealed it, in which case it is an
 * enc:v1: envelope and encrypted is true. The API treats both as opaque; only this client
 * knows which is which.
 */

import { request, requestAll, type RequestOptions } from './client';
import type { Note, SortKey } from '../types';

export interface NoteQuery {
  folder_id?: string | null;
  /** Search text. Matches title and content, case insensitively. */
  q?: string;
  sort?: SortKey;
  direction?: 'asc' | 'desc';
  trashed?: boolean;
  cursor?: string;
}

/** Turn the typed query into the wire parameters. Empty values are left out entirely. */
export function noteParams(query: NoteQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (query.folder_id) params['folder_id'] = query.folder_id;
  if (query.q && query.q.trim()) params['q'] = query.q.trim();
  if (query.sort) params['sort'] = query.sort;
  if (query.direction) params['direction'] = query.direction;
  if (query.trashed) params['trashed'] = 1;
  if (query.cursor) params['cursor'] = query.cursor;
  return params;
}

/** GET /workspaces/{workspace}/notes. Walks every page so the tree gets the whole set. */
export async function list(
  workspaceId: string,
  query: NoteQuery = {},
  options: RequestOptions = {},
): Promise<Note[]> {
  return requestAll<Note>({
    method: 'get',
    path: '/workspaces/' + workspaceId + '/notes',
    params: noteParams(query),
    signal: options.signal,
  });
}

/** The first page only, for callers that want the server's total as well. */
export async function page(
  workspaceId: string,
  query: NoteQuery = {},
  options: RequestOptions = {},
): Promise<{ items: Note[]; total: number | null }> {
  const result = await requestAll<Note>(
    {
      method: 'get',
      path: '/workspaces/' + workspaceId + '/notes',
      params: { ...noteParams(query), per_page: 1 },
      signal: options.signal,
    },
    undefined,
    1,
  );
  return { items: result, total: null };
}

/** POST /workspaces/{workspace}/notes. */
export async function create(
  workspaceId: string,
  payload: { title?: string; content?: string; folder_id?: string | null; encrypted?: boolean },
  options: RequestOptions = {},
): Promise<Note> {
  return request<Note>({
    method: 'post',
    path: '/workspaces/' + workspaceId + '/notes',
    body: payload,
    signal: options.signal,
  });
}

/** GET /notes/{note}. */
export async function get(id: string, options: RequestOptions = {}): Promise<Note> {
  return request<Note>({ method: 'get', path: '/notes/' + id, signal: options.signal });
}

/** PATCH /notes/{note}. Only the fields present are written. */
export async function update(
  id: string,
  payload: { title?: string; content?: string; folder_id?: string | null; encrypted?: boolean },
  options: RequestOptions = {},
): Promise<Note> {
  return request<Note>({ method: 'patch', path: '/notes/' + id, body: payload, signal: options.signal });
}

/** DELETE /notes/{note}. Soft. */
export async function remove(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/notes/' + id, signal: options.signal });
}

/** POST /notes/{note}/restore. */
export async function restore(id: string, options: RequestOptions = {}): Promise<Note> {
  return request<Note>({ method: 'post', path: '/notes/' + id + '/restore', signal: options.signal });
}

/** DELETE /notes/{note}/force. Permanent. */
export async function forceDelete(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/notes/' + id + '/force', signal: options.signal });
}

/** POST /notes/reorder. ids is the whole sibling list, in its new order. */
export async function reorder(
  ids: string[],
  folderId: string | null,
  options: RequestOptions = {},
): Promise<void> {
  const body: { ids: string[]; folder_id?: string | null } = { ids };
  if (folderId !== null) body.folder_id = folderId;
  await request<null>({ method: 'post', path: '/notes/reorder', body, signal: options.signal });
}
