/**
 * context/AuthContext.tsx: who is signed in.
 *
 * The session is a cookie, so the only question at boot is what GET /me says. A 401 there
 * means "not signed in yet", not "something went wrong", and the two are kept apart: a
 * network failure must not throw the user back to the sign-in form.
 *
 * This is also the one place a 401 clears the session, registered with the API client, so
 * a session that expires mid-session takes effect wherever the next request happens to be.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as auth from '../api/auth';
import { ApiError, setUnauthorizedHandler, type RequestOptions } from '../api/client';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  /** True until the first GET /me has answered. */
  booting: boolean;
  /** Why the session check failed, when it failed for a reason other than being signed out. */
  bootError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: auth.RegisterPayload) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the current user. Used after a preference change. */
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  /** The session ended: drop the user. Safe to call from anywhere, including a 401 handler. */
  const clear = useCallback((): void => {
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const check = useCallback(async (options: RequestOptions = {}): Promise<void> => {
    setBooting(true);
    try {
      const current = await auth.me(options);
      setUser(current);
      setBootError(null);
    } catch (error) {
      // An aborted check is this effect's own cleanup, which StrictMode runs once on mount.
      // Reporting it would put a failure on screen for a request nobody wanted back.
      if (options.signal && options.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) {
        // Not signed in. Not an error worth showing.
        setUser(null);
        setBootError(null);
      } else {
        setUser(null);
        setBootError(error instanceof Error ? error.message : 'The session could not be checked.');
      }
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void check({ signal: controller.signal });
    return () => controller.abort();
  }, [check]);

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const current = await auth.login({ email, password });
    setUser(current);
    setBootError(null);
  }, []);

  const signUp = useCallback(async (payload: auth.RegisterPayload): Promise<void> => {
    const current = await auth.register(payload);
    setUser(current);
    setBootError(null);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await auth.logout();
    } finally {
      // The local session is gone either way: a failed logout still leaves the user out.
      setUser(null);
    }
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setUser(await auth.me());
    } catch {
      // Left as it was: a refresh that failed is not evidence the session ended.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, booting, bootError, signIn, signUp, signOut, reload }),
    [user, booting, bootError, signIn, signUp, signOut, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** The session. Throws when used outside the provider. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider.');
  return value;
}
