/**
 * api/attachments.ts: file metadata, uploads and the two streaming routes.
 *
 * The bytes are never fetched through axios: download and preview are ordinary links the
 * browser follows, which is what lets a large file stream to disk instead of through a
 * JavaScript buffer.
 */

import { request, requestList, type RequestOptions } from './client';
import type { Attachment } from '../types';

/** GET /workspaces/{workspace}/attachments. */
export async function list(
  workspaceId: string,
  params: { folder_id?: string | null; q?: string; trashed?: boolean } = {},
  options: RequestOptions = {},
): Promise<Attachment[]> {
  const query: Record<string, unknown> = {};
  if (params.folder_id) query['folder_id'] = params.folder_id;
  if (params.q && params.q.trim()) query['q'] = params.q.trim();
  if (params.trashed) query['trashed'] = 1;
  return requestList<Attachment>({
    method: 'get',
    path: '/workspaces/' + workspaceId + '/attachments',
    params: query,
    signal: options.signal,
  });
}

/** POST /workspaces/{workspace}/attachments. Multipart, allowlisted and capped at 20 MB. */
export async function upload(
  workspaceId: string,
  payload: { file: File; folder_id?: string | null; encrypted?: boolean },
  options: RequestOptions = {},
): Promise<Attachment> {
  const form = new FormData();
  form.append('file', payload.file);
  if (payload.folder_id) form.append('folder_id', payload.folder_id);
  // Attachment bytes are stored exactly as they are uploaded. The vault seals note bodies and
  // nothing else, so this flag states what the server holds, not what it might hold one day.
  if (payload.encrypted) form.append('encrypted', '1');
  return request<Attachment>({
    method: 'post',
    path: '/workspaces/' + workspaceId + '/attachments',
    // Nothing is set here on purpose: the client drops its JSON default for a FormData body, so
    // the browser sends multipart/form-data with the boundary it chose itself.
    body: form,
    signal: options.signal,
  });
}

/** GET /attachments/{attachment}. Metadata only. */
export async function get(id: string, options: RequestOptions = {}): Promise<Attachment> {
  return request<Attachment>({ method: 'get', path: '/attachments/' + id, signal: options.signal });
}

/** The absolute URL of the streaming download route. */
export function downloadUrl(id: string): string {
  return '/api/v1/attachments/' + id + '/download';
}

/** The absolute URL of the inline preview route. Images and PDFs only. */
export function previewUrl(id: string): string {
  return '/api/v1/attachments/' + id + '/preview';
}

/** PATCH /attachments/{attachment}. */
export async function update(
  id: string,
  payload: { filename?: string; folder_id?: string | null },
  options: RequestOptions = {},
): Promise<Attachment> {
  return request<Attachment>({ method: 'patch', path: '/attachments/' + id, body: payload, signal: options.signal });
}

/** DELETE /attachments/{attachment}. Soft. */
export async function remove(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/attachments/' + id, signal: options.signal });
}

/** POST /attachments/{attachment}/restore. */
export async function restore(id: string, options: RequestOptions = {}): Promise<Attachment> {
  return request<Attachment>({ method: 'post', path: '/attachments/' + id + '/restore', signal: options.signal });
}

/** DELETE /attachments/{attachment}/force. Permanent. */
export async function forceDelete(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/attachments/' + id + '/force', signal: options.signal });
}

/** POST /attachments/reorder. */
export async function reorder(
  ids: string[],
  folderId: string | null,
  options: RequestOptions = {},
): Promise<void> {
  const body: { ids: string[]; folder_id?: string | null } = { ids };
  if (folderId !== null) body.folder_id = folderId;
  await request<null>({ method: 'post', path: '/attachments/reorder', body, signal: options.signal });
}
