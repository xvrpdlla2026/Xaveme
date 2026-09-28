/**
 * api/trash.ts: the cross-type trash.
 *
 * Folders and notes are soft deleted and recoverable until purged; the trash lists all
 * three kinds at once, which is why restore takes a type alongside the ids.
 */

import { request, type RequestOptions } from './client';
import type { TrashContents, TrashType } from '../types';

/** GET /workspaces/{workspace}/trash. */
export async function list(workspaceId: string, options: RequestOptions = {}): Promise<TrashContents> {
  return request<TrashContents>({
    method: 'get',
    path: '/workspaces/' + workspaceId + '/trash',
    signal: options.signal,
  });
}

/** POST /workspaces/{workspace}/trash/restore. Everything named comes back. */
export async function restore(
  workspaceId: string,
  payload: { type: TrashType; ids: string[] },
  options: RequestOptions = {},
): Promise<void> {
  await request<null>({
    method: 'post',
    path: '/workspaces/' + workspaceId + '/trash/restore',
    body: payload,
    signal: options.signal,
  });
}

/** DELETE /workspaces/{workspace}/trash. Empties the whole workspace's trash. */
export async function empty(workspaceId: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({
    method: 'delete',
    path: '/workspaces/' + workspaceId + '/trash',
    signal: options.signal,
  });
}

/** DELETE /workspaces/{workspace}/trash/{type}/{id}. Purges one row for good. */
export async function purge(
  workspaceId: string,
  type: TrashType,
  id: string,
  options: RequestOptions = {},
): Promise<void> {
  await request<null>({
    method: 'delete',
    path: '/workspaces/' + workspaceId + '/trash/' + type + '/' + id,
    signal: options.signal,
  });
}

/** The segment each type uses in the purge path. */
export const TRASH_SEGMENT: Record<TrashType, string> = {
  folder: 'folder',
  note: 'note',
  attachment: 'attachment',
};
