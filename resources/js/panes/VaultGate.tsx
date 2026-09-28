/**
 * panes/VaultGate.tsx: the way in, in front of everything the vault seals.
 *
 * The gate is drawn from the crypto module's own state rather than from a prop, because the key
 * is module state: it is installed by an unlock and dropped by a lock, and the two can happen in
 * a dialog this component cannot see. So the state is read on mount and re-read when a pane says
 * it moved, through one window event that every vault action raises. A gate that trusted a prop
 * would paint the app over a locked notebook.
 *
 * A notebook with no vault renders the children untouched. A configured but locked notebook
 * renders the unlock screen instead of them, so a locked workspace is never painted over.
 *
 * The two callbacks are the page's own bookkeeping: it reads the vault state itself, and it is
 * told when the state it can see actually changed rather than on every read.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";
import * as vaultApi from "../api/vault";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { markVaultUnknown, setVault, status as vaultStatus, unlockVault } from "../lib/crypto";
import type { VaultStatus } from "../lib/crypto";

/** Announced by every pane that moves the vault, so every other pane can re-read it. */
export const VAULT_CHANGED_EVENT = "notebook:vault-changed";

export function VaultGate({ children, onConfigured, onUnlocked }: { children: React.ReactNode; onConfigured?: () => void; onUnlocked?: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<VaultStatus>("off");
  const [ready, setReady] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The status the last read reported, which is what makes "changed" a fact rather than a guess.
  const previous = useRef<VaultStatus>("off");
  // Held in refs so the window listener is registered once, whatever the page passes in.
  const configured = useRef(onConfigured);
  configured.current = onConfigured;
  const unlocked = useRef(onUnlocked);
  unlocked.current = onUnlocked;

  /** Adopt what the server said without announcing it: nothing moved, it was simply read. */
  const adopt = useCallback((next: VaultStatus): void => {
    previous.current = next;
    setState(next);
  }, []);

  /** Record a move, and tell the page only about the two transitions it acts on. */
  const apply = useCallback((next: VaultStatus): void => {
    const before = previous.current;
    previous.current = next;
    setState(next);
    if (before === "off" && next !== "off" && configured.current) configured.current();
    if (before === "locked" && next === "unlocked" && unlocked.current) unlocked.current();
  }, []);

  useEffect(() => {
    let cancelled = false;
    vaultApi
      .get()
      .then((row) => {
        if (cancelled) return;
        setVault(row);
        adopt(vaultStatus());
      })
      .catch(() => {
        // A read that failed says nothing about whether a vault exists, so nothing is assumed:
        // the state becomes unknown, which refuses every write, and the gate still opens rather
        // than shutting the reader out of their own workspace. Treating this as "no vault" is
        // what wrote plain text into a sealed notebook.
        if (!cancelled) {
          markVaultUnknown();
          adopt(vaultStatus());
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  useEffect(() => {
    const sync = (): void => apply(vaultStatus());
    window.addEventListener(VAULT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, sync);
  }, [apply]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const value = passphrase.trim();
    if (!value || busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      // The row is re-read rather than trusted: the stored parameters are what the key is
      // derived from, and a stale copy would derive a key the vault was never sealed under.
      const row = await vaultApi.get();
      setVault(row);
      await unlockVault(row, value);
      apply(vaultStatus());
      setPassphrase("");
      toast("Notebook unlocked. It stays unlocked until you lock it or close the tab.", "success");
      window.dispatchEvent(new Event(VAULT_CHANGED_EVENT));
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That passphrase was refused.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || state !== "locked") return <>{children}</>;

  // The screen covers the viewport rather than taking a place in the page's own layout: a
  // caller that mounts the gate inside a grid cell would otherwise get the unlock form as one
  // more cell beside the workspace it is supposed to be hiding.
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, overflowY: "auto", background: "var(--bg-canvas)", padding: "24px" }}>
      <div className="lock-notice">
        <span className="lock-notice__mark" aria-hidden="true">
          <Icon name="database" size={22} />
        </span>
        <h2>This notebook is locked</h2>
        <p>
          Note bodies and stored files are sealed. The key is derived from your passphrase in this
          browser, and the passphrase is never sent anywhere.
        </p>
        <form onSubmit={(event) => void submit(event)} style={{ width: "min(320px, 100%)" }}>
          <div className="field">
            <label className="field__label" htmlFor="vault-gate-passphrase">
              Passphrase
            </label>
            <div className="field__control">
              <input
                id="vault-gate-passphrase"
                className="field__input"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  setError(null);
                }}
              />
            </div>
            {error ? (
              <p className="field__message field__message--error" role="alert">
                <Icon name="warning" size={12} />
                <span>{error}</span>
              </p>
            ) : null}
          </div>
          <button
            className="btn btn--primary"
            type="submit"
            disabled={busy || !passphrase.trim()}
            style={{ marginTop: "10px", width: "100%" }}
          >
            {busy ? "Unlocking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
