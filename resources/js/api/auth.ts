/**
 * api/auth.ts: session endpoints.
 *
 * Sanctum's SPA flow means there is no token to keep: login and register establish the
 * cookie session, /me says who it belongs to, and logout destroys it.
 */

import { request, type RequestOptions } from './client';
import type { User } from '../types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/** POST /login. Throttled server side at six attempts a minute. */
export async function login(payload: LoginPayload, options: RequestOptions = {}): Promise<User> {
  return request<User>({ method: 'post', path: '/login', body: payload, signal: options.signal });
}

/** POST /register. Creates the user, signs them in, and returns them. */
export async function register(payload: RegisterPayload, options: RequestOptions = {}): Promise<User> {
  return request<User>({ method: 'post', path: '/register', body: payload, signal: options.signal });
}

/** POST /logout. The session is gone afterwards whatever the response says. */
export async function logout(options: RequestOptions = {}): Promise<void> {
  await request<null>({ method: 'post', path: '/logout', signal: options.signal });
}

/** GET /me. This is what a reload asks to find out whether the session is still good. */
export async function me(options: RequestOptions = {}): Promise<User> {
  return request<User>({ method: 'get', path: '/me', signal: options.signal });
}
