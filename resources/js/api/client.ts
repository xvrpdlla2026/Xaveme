/**
 * api/client.ts: one axios instance for the whole SPA.
 *
 * Three things are centralised here, because a second copy of any of them is how a client
 * drifts out of step with its server:
 *
 *   - the session. Sanctum's SPA mode authenticates with a cookie, so every request sends
 *     credentials and every unsafe request carries the XSRF-TOKEN cookie back as a header.
 *   - the failure shape. Everything that can go wrong is normalised into one ApiError
 *     carrying a message and the field errors a form needs to render, so no caller ever
 *     reads an axios error object.
 *   - the 401 rule. An unauthenticated response clears the session in exactly one place.
 */

import axios, { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import type { Paged, Paginated } from '../types';

/** The JSON content type, stated once. */
const JSON_TYPE = 'application/json';

/** How long a request may sit before it is treated as failed. */
const TIMEOUT_MS = 30000;

/** Field errors keyed by the field name the server complained about. */
export type FieldErrors = Record<string, string[]>;

/**
 * Every API failure, in one shape.
 *
 * status is 0 for a failure that never reached the server: a dropped connection, a
 * timeout, a CORS refusal. Callers branch on that value rather than on prose.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fields: FieldErrors;

  constructor(message: string, status: number, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    // Required for instanceof to survive the downlevel class transform a bundler may apply.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** Whether this failure is a failure of the connection rather than of the request. */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** The first message the server attached to a field, if it attached one. */
  fieldError(field: string): string | null {
    const list = this.fields[field];
    return list && list.length ? list[0] ?? null : null;
  }
}

/** One handler, registered by AuthContext, told to clear the session. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Register what a 401 does. AuthContext owns this: clearing the user is session state, and
 * the transport layer must not hold a reference to the UI.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/** Read one cookie by name. Returns null rather than an empty string when it is absent. */
export function readCookie(name: string): string | null {
  const target = name + '=';
  const jar = document.cookie ? document.cookie.split('; ') : [];
  for (const entry of jar) {
    if (entry.indexOf(target) === 0) {
      return decodeURIComponent(entry.slice(target.length));
    }
  }
  return null;
}

/**
 * The CSRF token axios sends as X-XSRF-TOKEN.
 *
 * Laravel sets XSRF-TOKEN on every response; axios reads that cookie itself for its own
 * xsrfCookieName, and this header is set explicitly as well so the behaviour does not
 * depend on which axios build is installed. Reading it at request time, rather than
 * caching it at boot, is what keeps it correct after a session is refreshed.
 */
export function xsrfToken(): string | null {
  return readCookie('XSRF-TOKEN');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const message = payload['message'];
  return typeof message === 'string' && message.trim() ? message : null;
}

/** Keep only the entries that really are string arrays, so a form cannot be handed a number. */
function fieldErrorsOf(payload: unknown): FieldErrors {
  if (!isRecord(payload)) return {};
  const raw = payload['errors'];
  if (!isRecord(raw)) return {};
  const fields: FieldErrors = {};
  for (const [field, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const messages = value.filter((entry): entry is string => typeof entry === 'string');
      if (messages.length) fields[field] = messages;
    } else if (typeof value === 'string') {
      fields[field] = [value];
    }
  }
  return fields;
}

/** The messages a 422 carries are already a whole sentence when it has no errors object. */
function defaultMessage(status: number, fallback: string): string {
  if (status === 401) return 'Your session has ended. Sign in again to continue.';
  if (status === 403) return 'You do not have access to that.';
  if (status === 404) return 'That item no longer exists.';
  if (status === 413) return 'That file is larger than the server accepts.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The server could not complete that request.';
  return fallback;
}

function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof AxiosError) {
    if (!error.response) {
      const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      return new ApiError(
        timedOut ? 'The server took too long to answer.' : 'The server could not be reached.',
        0,
      );
    }
    const status = error.response.status;
    const payload: unknown = error.response.data;
    const fields = fieldErrorsOf(payload);
    const message = messageOf(payload) ?? defaultMessage(status, error.message);
    const failure = new ApiError(message, status, fields);
    if (status === 401 && onUnauthorized) onUnauthorized();
    return failure;
  }

  const message = error instanceof Error ? error.message : 'That request could not be completed.';
  return new ApiError(message, 0);
}

/** The one axios instance. Same origin, so the base path is all it needs. */
export const http: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    Accept: JSON_TYPE,
    'Content-Type': JSON_TYPE,
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: TIMEOUT_MS,
  // Laravel sends an errors object beside the message on a 422, and reading it here is
  // what lets a form point at the field rather than at the whole request.
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

http.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('Accept', JSON_TYPE);
  const token = xsrfToken();
  if (token) headers.set('X-XSRF-TOKEN', token);
  config.headers = headers;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalise(error)),
);

export interface RequestOptions {
  signal?: AbortSignal;
}

interface RequestConfig {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  params?: Record<string, unknown> | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

function dataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function send(config: RequestConfig): Promise<unknown> {
  try {
    const response = await http.request({
      method: config.method,
      url: config.path,
      params: config.params,
      data: config.body,
      signal: config.signal,
    });
    return response.data;
  } catch (error) {
    throw normalise(error);
  }
}

/** One resource: the payload inside Laravel's data wrapper. */
export async function request<T>(config: RequestConfig): Promise<T> {
  return dataRecord(await send(config))['data'] as T;
}

/** A list at the top level: the payload inside data, which is itself an array. */
export async function requestList<T>(config: RequestConfig): Promise<T[]> {
  const payload = dataRecord(await send(config));
  const data = payload['data'];
  if (Array.isArray(data)) return data as T[];
  if (isRecord(data) && Array.isArray(data['data'])) return data['data'] as T[];
  return [];
}

/** A paginator: items, the total, and the links the next page lives in. */
export async function requestPage<T>(config: RequestConfig): Promise<Paged<T>> {
  const payload = dataRecord(await send(config));
  const data = payload['data'];
  const meta = isRecord(payload['meta']) ? payload['meta'] : null;
  const links = isRecord(payload['links']) ? payload['links'] : null;
  const next = links && typeof links['next'] === 'string' ? links['next'] : null;

  if (Array.isArray(data)) {
    // Not paginated at the top level: either a plain array or a nested paginator.
    return { items: data as T[], nextCursor: next, total: meta ? totalOf(meta) : data.length };
  }
  if (isRecord(data)) {
    const nested = Array.isArray(data['data']) ? (data['data'] as T[]) : [];
    const nestedLinks = isRecord(data['links']) ? data['links'] : links;
    const nestedNext = nestedLinks && typeof nestedLinks['next'] === 'string' ? nestedLinks['next'] : null;
    const nestedMeta = isRecord(data['meta']) ? data['meta'] : meta;
    return { items: nested, nextCursor: nestedNext, total: nestedMeta ? totalOf(nestedMeta) : nested.length };
  }
  return { items: [], nextCursor: null, total: null };
}

function totalOf(meta: Record<string, unknown>): number | null {
  const total = meta['total'];
  return typeof total === 'number' ? total : null;
}

/**
 * Read every page a paginated list has, up to a ceiling.
 *
 * The tree needs the whole folder and note set at once, and asking for it a page at a time
 * is the only way the contract offers. The ceiling is a guard against a loop: a server that
 * echoes the same next link forever would otherwise hang the tab.
 */
export async function requestAll<T>(
  config: RequestConfig,
  mapPage?: (nextCursor: string) => Record<string, unknown>,
  maxPages = 20,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const params: Record<string, unknown> = { ...(config.params ?? {}) };
    if (cursor) Object.assign(params, mapPage ? mapPage(cursor) : { cursor });
    const page = await requestPage<T>({ ...config, params });
    items.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < maxPages);
  return items;
}

/** A Laravel paginator payload, for the rare caller that wants the wrapper itself. */
export type { Paginated };
