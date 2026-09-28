/**
 * api/folders.ts: folders, which nest by parent_id and are soft deleted.
 */

import { request, requestList, type RequestOptions } from './client';
import type { Folder } from '../types';

/** GET /workspaces/{workspace}/folders. */
export async function list(
  workspaceId: string,
  params: { trashed?: boolean } = {},
  options: RequestOptions = {},
): Promise<Folder[]> {
  const query: Record<string, unknown> = {};
  if (params.trashed) query['trashed'] = 1;
  return requestList<Folder>({
    method: 'get',
    path: '/workspaces/' + workspaceId + '/folders',
    params: query,
    signal: options.signal,
  });
}

/** POST /workspaces/{workspace}/folders. parent_id null makes a root folder. */
export async function create(
  workspaceId: string,
  payload: { name: string; parent_id?: string | null },
  options: RequestOptions = {},
): Promise<Folder> {
  return request<Folder>({
    method: 'post',
    path: '/workspaces/' + workspaceId + '/folders',
    body: payload,
    signal: options.signal,
  });
}

/** PATCH /folders/{folder}. Renaming and moving are the same call. */
export async function update(
  id: string,
  payload: { name?: string; parent_id?: string | null },
  options: RequestOptions = {},
): Promise<Folder> {
  return request<Folder>({ method: 'patch', path: '/folders/' + id, body: payload, signal: options.signal });
}

/** DELETE /folders/{folder}. Soft: the whole subtree goes, and it is recoverable. */
export async function remove(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/folders/' + id, signal: options.signal });
}

/** POST /folders/{folder}/restore. */
export async function restore(id: string, options: RequestOptions = {}): Promise<Folder> {
  return request<Folder>({ method: 'post', path: '/folders/' + id + '/restore', signal: options.signal });
}

/** DELETE /folders/{folder}/force. Permanent. */
export async function forceDelete(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/folders/' + id + '/force', signal: options.signal });
}

/** POST /folders/reorder. Rewrites the sibling list of the folder's parent. */
export async function reorder(ids: string[], options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'post', path: '/folders/reorder', body: { ids }, signal: options.signal });
}
