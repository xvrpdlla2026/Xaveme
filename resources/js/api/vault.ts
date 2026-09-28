/**
 * api/vault.ts: the vault row.
 *
 * The server stores the derivation parameters and one sealed known string, and treats note
 * content and attachment bytes as opaque. The passphrase never leaves the browser, so
 * nothing here ever carries it.
 */

import { request, type RequestOptions } from './client';
import type { Vault } from '../types';

/** GET /vault. configured is false until a vault row exists. */
export async function get(options: RequestOptions = {}): Promise<Vault> {
  return request<Vault>({ method: 'get', path: '/vault', signal: options.signal });
}

/** PUT /vault. The row is exactly the four derived values. */
export async function put(
  payload: { salt: string; iterations: number; check_iv: string; check_ct: string },
  options: RequestOptions = {},
): Promise<Vault> {
  return request<Vault>({ method: 'put', path: '/vault', body: payload, signal: options.signal });
}

/** DELETE /vault. Removes the row; stored envelopes are left exactly as they are. */
export async function remove(options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'delete', path: '/vault', signal: options.signal });
}
