/**
 * api/preferences.ts: the two display settings.
 *
 * They are stored twice on purpose. The server copy is the account's preference and follows
 * the user between browsers; the localStorage copy is what the boot script in the blade view
 * reads so the first paint already has the right theme. Neither is authoritative about the
 * other: the provider writes both.
 */

import { request, type RequestOptions } from './client';
import type { Preferences } from '../types';

/** GET /preferences. */
export async function get(options: RequestOptions = {}): Promise<Preferences> {
  return request<Preferences>({ method: 'get', path: '/preferences', signal: options.signal });
}

/** PUT /preferences. Both fields are required by the contract. */
export async function update(payload: Preferences, options: RequestOptions = {}): Promise<Preferences> {
  return request<Preferences>({ method: 'put', path: '/preferences', body: payload, signal: options.signal });
}
