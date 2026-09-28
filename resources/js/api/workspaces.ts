/**
 * api/workspaces.ts: workspaces, their stats readout, and their order.
 */

import { request, requestList, type RequestOptions } from './client';
import type { Workspace, WorkspaceStats } from '../types';

/** GET /workspaces. The order the server returns is the order the rail draws. */
export async function list(options: RequestOptions = {}): Promise<Workspace[]> {
  return requestList<Workspace>({ method: 'get', path: '/workspaces', signal: options.signal });
}

/** POST /workspaces. */
export async function create(name: string, options: RequestOptions = {}): Promise<Workspace> {
  return request<Workspace>({ method: 'post', path: '/workspaces', body: { name }, signal: options.signal });
}

/** GET /workspaces/{workspace}. */
export async function get(id: string, options: RequestOptions = {}): Promise<Workspace> {
  return request<Workspace>({ method: 'get', path: '/workspaces/' + id, signal: options.signal });
}

/** PATCH /workspaces/{workspace}. */
export async function rename(id: string, name: string, options: RequestOptions = {}): Promise<Workspace> {
  return request<Workspace>({ method: 'patch', path: '/workspaces/' + id, body: { name }, signal: options.signal });
}

/** DELETE /workspaces/{workspace}. Cascades to folders, notes, attachments and tasks. */
export async function remove(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/workspaces/' + id, signal: options.signal });
}

/** GET /workspaces/{workspace}/stats. Counts and attachment bytes for the rail readout. */
export async function stats(id: string, options: RequestOptions = {}): Promise<WorkspaceStats> {
  return request<WorkspaceStats>({ method: 'get', path: '/workspaces/' + id + '/stats', signal: options.signal });
}

/** POST /workspaces/reorder. The whole sibling list, rewritten in one call. */
export async function reorder(ids: string[], options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'post', path: '/workspaces/reorder', body: { ids }, signal: options.signal });
}
