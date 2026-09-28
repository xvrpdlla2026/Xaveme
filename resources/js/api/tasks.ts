/**
 * api/tasks.ts: the task list.
 *
 * due_has_time is the flag that decides whether the pane prints a time or just a date, and
 * done_at is stamped by the server when done flips true and cleared when it flips back.
 */

import { request, requestList, type RequestOptions } from './client';
import type { Task, TaskPriority, TaskView } from '../types';

export interface TaskQuery {
  view?: TaskView;
  folder_id?: string | null;
  q?: string;
}

/** GET /workspaces/{workspace}/tasks. */
export async function list(
  workspaceId: string,
  query: TaskQuery = {},
  options: RequestOptions = {},
): Promise<Task[]> {
  const params: Record<string, unknown> = {};
  if (query.view) params['view'] = query.view;
  if (query.folder_id) params['folder_id'] = query.folder_id;
  if (query.q && query.q.trim()) params['q'] = query.q.trim();
  return requestList<Task>({
    method: 'get',
    path: '/workspaces/' + workspaceId + '/tasks',
    params,
    signal: options.signal,
  });
}

export interface TaskDraft {
  title: string;
  notes?: string | null;
  folder_id?: string | null;
  due_at?: string | null;
  due_has_time?: boolean;
  priority?: TaskPriority;
}

/** POST /workspaces/{workspace}/tasks. */
export async function create(workspaceId: string, draft: TaskDraft, options: RequestOptions = {}): Promise<Task> {
  return request<Task>({
    method: 'post',
    path: '/workspaces/' + workspaceId + '/tasks',
    body: draft,
    signal: options.signal,
  });
}

/** PATCH /tasks/{task}. Any subset of the writable fields. */
export async function update(
  id: string,
  patch: Partial<TaskDraft> & { done?: boolean },
  options: RequestOptions = {},
): Promise<Task> {
  return request<Task>({ method: 'patch', path: '/tasks/' + id, body: patch, signal: options.signal });
}

/** DELETE /tasks/{task}. Hard: a task has no trash. */
export async function remove(id: string, options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/tasks/' + id, signal: options.signal });
}

/** POST /tasks/reorder. */
export async function reorder(ids: string[], options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'post', path: '/tasks/reorder', body: { ids }, signal: options.signal });
}
