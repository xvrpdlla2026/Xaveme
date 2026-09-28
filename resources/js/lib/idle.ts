/**
 * lib/idle.ts: two small session helpers, plus the debounce the autosave is built on.
 *
 * Neither helper knows anything about React or about the API. The editor decides what a
 * debounced save does; this file only decides when.
 */

/** What a flushable debounce looks like. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run the pending call now, if there is one. */
  flush: () => void;
  /** Drop the pending call without running it. */
  cancel: () => void;
  /** Whether a call is waiting. */
  pending: () => boolean;
}

/**
 * Trailing-edge debounce with flush and cancel. The editor needs flush: switching notes or
 * hiding the tab must not lose the last few keystrokes still inside the window.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const invoke = (): void => {
    const args = lastArgs;
    timer = null;
    lastArgs = null;
    if (args) fn(...args);
  };

  const debounced = ((...args: A): void => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(invoke, wait);
  }) as Debounced<A>;

  debounced.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      invoke();
    }
  };
  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  debounced.pending = (): boolean => timer !== null;
  return debounced;
}

export interface IdleWatcherOptions {
  /** How long without input before the session counts as idle. */
  timeoutMs: number;
  /** Called once when the idle threshold is crossed. */
  onIdle: () => void;
  /** Called on the first input after an idle period. */
  onActive?: () => void;
}

/**
 * Watch for idleness. The events are the ones that mean a person is still there, and the
 * listener is passive so it never delays a scroll or a keystroke.
 *
 * Nothing calls this yet: the vault's key lives only in a module variable, so a page that
 * goes idle has nothing to forget. It is exported so the one feature that would need it
 * (dropping the key after a period of no input) does not have to invent its own timer.
 */
export function watchIdle(options: IdleWatcherOptions): () => void {
  const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let idle = false;

  const arm = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      idle = true;
      options.onIdle();
    }, options.timeoutMs);
  };

  const onInput = (): void => {
    if (idle) {
      idle = false;
      if (options.onActive) options.onActive();
    }
    arm();
  };

  events.forEach((name) => window.addEventListener(name, onInput, { passive: true }));
  arm();

  return () => {
    if (timer !== null) clearTimeout(timer);
    events.forEach((name) => window.removeEventListener(name, onInput));
  };
}
