/**
 * api/search.ts: one search across every workspace the account owns.
 *
 * The tree's own listing is scoped to the open workspace; this is not. Every hit
 * carries the workspace it lives in so the caller can say so, and so opening a hit
 * from another workspace can move there first.
 */

import { request, type RequestOptions } from './client';

export interface SearchNoteHit {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  folder_id: string | null;
  title: string;
  updated_at: string | null;
}

export interface SearchFileHit {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  folder_id: string | null;
  filename: string;
  mime_type: string | null;
  size: number;
  created_at: string | null;
}

export interface SearchResponse {
  query: string;
  notes: SearchNoteHit[];
  files: SearchFileHit[];
}

/** GET /search?q=. Notes and files, from every workspace this account owns. */
export async function search(term: string, options: RequestOptions = {}): Promise<SearchResponse> {
  return request<SearchResponse>({
    method: 'get',
    path: '/search',
    params: { q: term },
    signal: options.signal,
  });
}
