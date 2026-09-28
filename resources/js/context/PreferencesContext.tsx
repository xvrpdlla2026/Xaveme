/**
 * context/PreferencesContext.tsx: theme and palette.
 *
 * Both are written in two places on purpose. The server copy is the account's preference and
 * follows the user between browsers; the localStorage copy is what the boot script in the
 * blade view reads, so the first paint already has the right theme instead of flashing the
 * default. The DOM attributes are what the stylesheet actually reads.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import * as preferencesApi from '../api/preferences';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import type { Palette, Preferences, Theme } from '../types';

/** The keys the blade view's boot script reads. They are a public contract with that file. */
const THEME_KEY = 'notebook.theme';
const PALETTE_KEY = 'notebook.palette';

/** 'indigo' is the default and needs no attribute: the stylesheet already declares it. */
export const DEFAULT_PALETTE: Palette = 'indigo';

export const PALETTES: Palette[] = ['indigo', 'teal', 'amber', 'rose', 'violet', 'graphite'];

interface PreferencesContextValue {
  theme: Theme;
  palette: Palette;
  /** True while the account's stored preference is on its way back from the server. */
  saving: boolean;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: Palette) => void;
  /** Adopt what the server sent, without writing it back. */
  adopt: (preferences: Preferences | null | undefined) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === null) return 'light';
    const parsed: unknown = JSON.parse(raw);
    return parsed === 'dark' || parsed === 'light' ? parsed : 'light';
  } catch {
    return 'light';
  }
}

function readStoredPalette(): Palette {
  try {
    const raw = window.localStorage.getItem(PALETTE_KEY);
    if (raw === null) return DEFAULT_PALETTE;
    const parsed: unknown = JSON.parse(raw);
    return PALETTES.indexOf(parsed as Palette) !== -1 ? (parsed as Palette) : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or disabled store is not a reason to refuse the change on screen.
  }
}

/** Paint a preference onto the document, which is the only thing the stylesheet reads. */
function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyPalette(palette: Palette): void {
  if (palette === DEFAULT_PALETTE) document.documentElement.removeAttribute('data-palette');
  else document.documentElement.setAttribute('data-palette', palette);
}

export function PreferencesProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [palette, setPaletteState] = useState<Palette>(() => readStoredPalette());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    persist(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    applyPalette(palette);
    persist(PALETTE_KEY, palette);
  }, [palette]);

  // The account's preference wins over whatever this browser had stored.
  const adopt = useCallback((incoming: Preferences | null | undefined): void => {
    if (!incoming) return;
    if (incoming.theme === 'light' || incoming.theme === 'dark') setThemeState(incoming.theme);
    if (PALETTES.indexOf(incoming.palette) !== -1) setPaletteState(incoming.palette);
  }, []);

  useEffect(() => {
    adopt(user ? user.preferences : null);
  }, [user, adopt]);

  /** Write the pair to the server, so the choice follows the account. */
  const push = useCallback(
    (next: Preferences): void => {
      if (!user) return;
      setSaving(true);
      preferencesApi
        .update(next)
        .catch((error: unknown) => {
          // The local change stands either way: the appearance already changed, and reverting
          // it would be a bigger surprise than a preference that did not follow the account.
          toast(error instanceof Error ? error.message : 'The preference could not be saved.', 'error');
        })
        .finally(() => setSaving(false));
    },
    [user, toast],
  );

  const setTheme = useCallback(
    (next: Theme): void => {
      setThemeState(next);
      push({ theme: next, palette });
    },
    [push, palette],
  );

  const setPalette = useCallback(
    (next: Palette): void => {
      setPaletteState(next);
      push({ theme, palette: next });
    },
    [push, theme],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ theme, palette, saving, setTheme, setPalette, adopt }),
    [theme, palette, saving, setTheme, setPalette, adopt],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/** The theme and palette. Throws when used outside the provider. */
export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside a PreferencesProvider.');
  return value;
}
