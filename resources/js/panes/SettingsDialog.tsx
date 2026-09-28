/**
 * panes/SettingsDialog.tsx: the one persistent dialog.
 *
 * Four sections, and each one reads the fact it describes rather than trusting what it left
 * behind: the appearance comes from the preferences context, which is the state the document is
 * painted from, the storage numbers come from the workspace's stats, and the vault state comes
 * from the crypto module, which is where the key actually lives.
 *
 * The vault section is the only place the vault is created, unlocked, re-keyed or removed. It
 * calls the helpers in lib/crypto and never writes crypto of its own, so the format has one
 * implementation and this file only has to be honest about what each action does not do.
 *
 * The four prompts are dialogs of this file's own rather than the shared ConfirmDialog, because
 * they carry password fields and the shared one draws no children: a prompt that dropped its
 * fields would ask for a passphrase with nowhere to type it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as vaultApi from "../api/vault";
import * as workspaceApi from "../api/workspaces";
import Icon from "../components/Icon";
import { PALETTES, usePreferences } from "../context/PreferencesContext";
import { useToast } from "../context/ToastContext";
import {
  cancelSetup,
  commitVault,
  lock,
  markVaultUnknown,
  setVault,
  setupVault,
  status as vaultStatus,
  unlockVault,
  vaultRow,
} from "../lib/crypto";
import type { VaultStatus } from "../lib/crypto";
import { formatBytes } from "../lib/format";
import type { Palette, Theme, Workspace as WorkspaceModel, WorkspaceStats } from "../types";
import { VAULT_CHANGED_EVENT } from "./VaultGate";

/** The shortest passphrase accepted: it is the whole protection, so its length is what matters. */
const MIN_PASSPHRASE = 8;

/** The key the workspace page stores its last choice under, read so the readout matches it. */
const LAST_WORKSPACE_KEY = "notebook.lastWorkspaceId";

const THEMES: { value: Theme; label: string; icon: "sun" | "moon" }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

type VaultPromptKind = "create" | "unlock" | "change" | "remove";

function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function paletteLabel(palette: Palette): string {
  return palette.charAt(0).toUpperCase() + palette.slice(1);
}

/** What the readout calls each state. An unknown vault is a read that failed, not an absent one. */
function vaultStateLabel(state: VaultStatus): string {
  if (state === "off") return "Off";
  if (state === "locked") return "Locked";
  if (state === "unlocked") return "Unlocked for this session";
  return "Could not be read";
}

function vaultStateHint(state: VaultStatus): string {
  if (state === "off") return "Note bodies and stored files are kept as plaintext.";
  if (state === "locked") return "Sealed records stay unreadable until the passphrase is entered.";
  if (state === "unlocked") {
    return "Kept for this tab: a reload stays unlocked, and closing the tab locks it again.";
  }
  return "The vault row could not be read, so nothing is assumed: sealed bodies stay hidden and nothing is written until it can be.";
}

interface VaultPromptProps {
  title: string;
  message: string;
  consequences?: string[];
  confirmLabel: string;
  danger?: boolean;
  /** The one action. Its failure is written next to the fields that caused it. */
  run: () => Promise<void>;
  onCancel: () => void;
  children: ReactNode;
}

/**
 * One vault ask, in the app's dialog clothes.
 *
 * It stays open while the work runs and keeps a failure in front of the fields, which is the
 * contract the shared dialogs keep; the difference is only that this one is built for fields
 * that are the caller's own.
 */
function VaultPrompt({
  title,
  message,
  consequences,
  confirmLabel,
  danger,
  run,
  onCancel,
  children,
}: VaultPromptProps): ReactNode {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node && !node.open) {
      try {
        node.showModal();
      } catch {
        // Already in the top layer. The form still renders.
      }
    }
  }, []);

  const submit = (): void => {
    setError(null);
    setBusy(true);
    void run()
      .catch((thrown: unknown) => {
        setError(thrown instanceof Error ? thrown.message : "That did not work.");
      })
      .finally(() => setBusy(false));
  };

  return (
    <dialog
      ref={ref}
      className={"dialog" + (danger ? " dialog--danger" : "")}
      aria-labelledby="vault-prompt-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        className="dialog__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="dialog__head">
          <span className="dialog__icon" aria-hidden="true">
            <Icon name={danger ? "warning" : "database"} size={16} />
          </span>
          <h2 id="vault-prompt-title" className="dialog__title">
            {title}
          </h2>
          <button className="dialog__close" type="button" aria-label="Close" onClick={onCancel}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="dialog__body">
          <p className="dialog__message">{message}</p>
          {consequences && consequences.length ? (
            <ul className="dialog__consequences">
              {consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {children}
          {error ? (
            <p className="field__message field__message--error" role="alert">
              <Icon name="warning" size={12} />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        <div className="dialog__footer">
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={"btn " + (danger ? "btn--danger" : "btn--primary")}
            type="submit"
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const { theme, palette, saving, setTheme, setPalette } = usePreferences();
  const ref = useRef<HTMLDialogElement | null>(null);

  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const [state, setState] = useState<VaultStatus>(() => vaultStatus());
  const [prompt, setPrompt] = useState<VaultPromptKind | null>(null);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (node && !node.open) {
      try {
        node.showModal();
      } catch {
        // Already in the top layer. The dialog still renders.
      }
    }
  }, [open]);

  // The vault row is a fact about the server, so it is read fresh every time the panel opens
  // rather than left from the last time it was.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    vaultApi
      .get()
      .then((row) => {
        if (cancelled) return;
        setVault(row);
        setState(vaultStatus());
      })
      .catch(() => {
        // A read that failed is not a vault that is absent, so the state is left unknown and
        // every write refuses from here. Reporting "off" is how a sealed notebook came to be
        // saved as plain text.
        if (!cancelled) {
          markVaultUnknown();
          setState(vaultStatus());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // The workspace the page is showing is the one the readout should describe. The page records
  // its choice under one key, which is read here rather than asked for as a prop this dialog
  // does not receive.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const list = await workspaceApi.list();
        if (cancelled) return;
        const stored = readLastWorkspace();
        const target: WorkspaceModel | undefined =
          list.find((workspace) => workspace.id === stored) ?? list[0];
        if (!target) {
          setStats(null);
          return;
        }
        const row = await workspaceApi.stats(target.id);
        if (!cancelled) setStats(row);
      } catch {
        // A readout that could not be read shows what it has: nothing here is a control the
        // reader has to act on, so an error would only be noise.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // The browser's own quota is the one number the server cannot know.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (navigator.storage && typeof navigator.storage.estimate === "function") {
      navigator.storage
        .estimate()
        .then((estimate) => {
          if (!cancelled && typeof estimate.quota === "number") setQuota(estimate.quota);
        })
        .catch(() => {
          // No estimate: the readout simply omits the row.
        });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  const announce = (): void => {
    window.dispatchEvent(new Event(VAULT_CHANGED_EVENT));
  };

  /** Read the vault row again, which is the way out of the unknown state. */
  const readVault = useCallback((): void => {
    vaultApi
      .get()
      .then((row) => {
        setVault(row);
        setState(vaultStatus());
        announce();
      })
      .catch(() => {
        markVaultUnknown();
        setState(vaultStatus());
        toast(
          "The vault row could not be read. Nothing is assumed about it, so nothing is written until it can be.",
          "error",
        );
      });
  }, [toast]);

  /** The one place the passphrase fields are emptied, so no path can leave one behind. */
  const clearPassphrases = (): void => {
    setFirst("");
    setSecond("");
  };

  const openPrompt = (kind: VaultPromptKind): void => {
    clearPassphrases();
    setPrompt(kind);
  };

  const lockNow = (): void => {
    lock();
    setState(vaultStatus());
    announce();
    toast("Notebook locked. Note bodies and files stay unreadable until you unlock again.", "info", 7000);
  };

  /**
   * Turn the vault on: derive a key from the passphrase, seal the known string under it, and
   * store only the parameters. The passphrase is never part of what is sent.
   */
  const createVault = async (): Promise<void> => {
    const value = first.trim();
    if (value.length < MIN_PASSPHRASE) {
      throw new Error(
        "Use at least " +
          MIN_PASSPHRASE +
          " characters. The passphrase is the whole protection, so its length matters most.",
      );
    }
    if (value !== second.trim()) throw new Error("The two passphrases do not match.");
    const draft = await setupVault(value);
    try {
      await vaultApi.put(draft);
    } catch (error) {
      // Nothing was committed, so the provisional key is dropped and the notebook is left
      // exactly as it was.
      cancelSetup();
      throw error;
    }
    commitVault(draft);
    // The vault exists now, so the passphrase leaves this component's state right here rather
    // than waiting for the next prompt to open.
    clearPassphrases();
    setState(vaultStatus());
    setPrompt(null);
    announce();
    toast(
      "Encryption is on. What is saved from now on is sealed, the parameters are stored, and the notebook stays unlocked in this tab until you lock it or close it.",
      "success",
      12000,
    );
  };

  const unlockNow = async (): Promise<void> => {
    const value = first.trim();
    if (!value) throw new Error("Enter the passphrase to unlock.");
    const row = await vaultApi.get();
    setVault(row);
    // A wrong passphrase fails here, inside the prompt, rather than being reported as damage.
    await unlockVault(row, value);
    clearPassphrases();
    setState(vaultStatus());
    setPrompt(null);
    announce();
    toast("Notebook unlocked. It stays unlocked in this tab until you lock it or close the tab.", "success");
  };

  /**
   * Change the passphrase: the current one is proved first, then a new salt and a new key are
   * derived from the new one and stored. The vault row is all this rewrites, so records already
   * sealed keep the envelope they were written with, which is what the prompt states.
   */
  const changePassphrase = async (): Promise<void> => {
    const current = first.trim();
    const next = second.trim();
    if (!current) throw new Error("Enter the passphrase this notebook is sealed with.");
    if (next.length < MIN_PASSPHRASE) {
      throw new Error("Use at least " + MIN_PASSPHRASE + " characters for the new passphrase.");
    }
    const row = await vaultApi.get();
    setVault(row);
    await unlockVault(row, current);
    const draft = await setupVault(next);
    try {
      await vaultApi.put(draft);
    } catch (error) {
      cancelSetup();
      setState(vaultStatus());
      throw error;
    }
    commitVault(draft);
    clearPassphrases();
    setState(vaultStatus());
    setPrompt(null);
    announce();
    toast("The vault now uses the new passphrase, and this tab stays unlocked.", "success");
  };

  const removeVault = async (): Promise<void> => {
    await vaultApi.remove();
    // The row is gone, so the local key goes with it: a key with no parameters behind it could
    // only seal records that nothing can open again.
    setVault(null);
    setState(vaultStatus());
    setPrompt(null);
    announce();
    toast("Encryption is off. Nothing was deleted, and records already sealed keep their envelope.", "info", 9000);
  };

  const infoRow = (key: string, value: string, hint?: string): ReactNode => (
    <div className="info-row" key={key}>
      <span className="info-row__key">{key}</span>
      <span className="info-row__col">
        <span className="info-row__val">{value}</span>
        {hint ? <span className="info-row__hint">{hint}</span> : null}
      </span>
    </div>
  );

  const passwordField = (
    id: string,
    label: string,
    helper: string,
    value: string,
    onChange: (next: string) => void,
    autoComplete: string,
  ): ReactNode => (
    <div className="field" key={id}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          type="password"
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <p className="field__message">{helper}</p>
    </div>
  );

  const storageRows: ReactNode[] = stats
    ? [
        infoRow("Notes", String(stats.notes)),
        infoRow("Folders", String(stats.folders)),
        infoRow(
          "Files",
          String(stats.attachments),
          stats.attachment_bytes === undefined ? undefined : formatBytes(stats.attachment_bytes) + " of stored bytes",
        ),
        infoRow("Open tasks", String(stats.open_tasks ?? stats.tasks ?? 0)),
        quota ? infoRow("Browser storage", formatBytes(quota), "The share of it this site may use") : null,
      ]
    : [infoRow("Storage", "Reading this workspace...")];

  const vaultInfo = vaultRow();
  const vaultRows: ReactNode[] = [
    infoRow("Encryption", vaultStateLabel(state), vaultStateHint(state)),
    vaultInfo && vaultInfo.configured
      ? infoRow("Key derivation", "PBKDF2-SHA-256, " + vaultInfo.iterations.toLocaleString() + " iterations")
      : null,
  ];

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__form">
        <header className="dialog__head">
          <span className="dialog__icon" aria-hidden="true">
            <Icon name="settings" size={16} />
          </span>
          <h2 id="settings-title" className="dialog__title">
            Settings
          </h2>
          <button className="dialog__close" type="button" aria-label="Close settings" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="dialog__body">
          <section className="dialog__section">
            <h3>Appearance</h3>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEMES.map((option) => (
                <label className="segmented__item" key={option.value} title={option.label + " theme"}>
                  <input
                    className="segmented__input"
                    type="radio"
                    name="theme"
                    value={option.value}
                    checked={theme === option.value}
                    onChange={() => setTheme(option.value)}
                  />
                  <span className="segmented__icon">
                    <Icon name={option.icon} size={14} />
                  </span>
                  <span className="segmented__label">{option.label}</span>
                </label>
              ))}
            </div>
            <div
              className="palette-group"
              role="radiogroup"
              aria-label="Colour palette"
              style={{ marginTop: "12px" }}
            >
              {PALETTES.map((name) => (
                <label className="palette-option" key={name}>
                  <input
                    className="palette-option__input"
                    type="radio"
                    name="palette"
                    value={name}
                    checked={palette === name}
                    onChange={() => setPalette(name)}
                  />
                  <span className={"palette-option__dot palette-option__dot--" + name} aria-hidden="true" />
                  <span className="palette-option__name">{paletteLabel(name)}</span>
                </label>
              ))}
            </div>
            <p className="dialog__note">
              {saving
                ? "Saving this choice to your account..."
                : "Surfaces and the accent change together, and each palette has its own dark variant."}
            </p>
          </section>

          <section className="dialog__section">
            <h3>Storage</h3>
            <div className="info-list">{storageRows}</div>
            <p className="dialog__note">
              Notes and files are stored on the server for this workspace, and the counts come from its own stats.
              Nothing here is a second copy on this machine.
            </p>
          </section>

          <section className="dialog__section">
            <h3>Security</h3>
            <div className="info-list">{vaultRows}</div>
            <p className="dialog__note">
              Note bodies and stored file contents are sealed with your passphrase, and only the derivation
              parameters and one sealed check value are stored. Everything else stays readable: titles, file names,
              folder names, dates and sizes are not encrypted, which is what still lets you browse and search. The
              passphrase is never sent anywhere and cannot be recovered, so a forgotten one leaves the sealed note
              bodies and files unreadable.
            </p>
            <div className="vault-actions">
              {state === "off" ? (
                <button className="btn btn--primary" type="button" onClick={() => openPrompt("create")}>
                  Turn on encryption
                </button>
              ) : state === "locked" ? (
                <button className="btn btn--primary" type="button" onClick={() => openPrompt("unlock")}>
                  Unlock...
                </button>
              ) : state === "unknown" ? (
                <>
                  <button className="btn btn--primary" type="button" onClick={readVault}>
                    Try again
                  </button>
                  <button className="btn" type="button" onClick={() => openPrompt("unlock")}>
                    Unlock...
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" type="button" onClick={lockNow}>
                    Lock now
                  </button>
                  <button className="btn" type="button" onClick={() => openPrompt("change")}>
                    Change passphrase...
                  </button>
                  <button className="btn btn--danger-ghost" type="button" onClick={() => openPrompt("remove")}>
                    Turn off encryption
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {prompt === "create" ? (
        <VaultPrompt
          title="Turn on encryption"
          message="Note bodies and stored files will be sealed with a passphrase you choose. Only the derivation parameters are stored, never the passphrase."
          consequences={[
            "A forgotten passphrase cannot be recovered: the sealed bodies and files would be unreadable for good.",
            "Titles, file names, folder names, dates and sizes stay readable, which is what still lets you browse and search.",
            "Records written before this stay readable as they are, and are sealed the next time they are saved.",
            "The notebook stays unlocked in this tab until you lock it or close it.",
          ]}
          confirmLabel="Turn on encryption"
          run={createVault}
          onCancel={() => setPrompt(null)}
        >
          <div className="field-stack">
            {passwordField(
              "vault-new-pass",
              "Passphrase",
              "At least " + MIN_PASSPHRASE + " characters. It is not stored anywhere.",
              first,
              setFirst,
              "new-password",
            )}
            {passwordField(
              "vault-new-pass-again",
              "Passphrase again",
              "Spaces at the start and end are ignored.",
              second,
              setSecond,
              "off",
            )}
          </div>
        </VaultPrompt>
      ) : null}

      {prompt === "unlock" ? (
        <VaultPrompt
          title="Unlock the notebook"
          message="The key is derived from your passphrase in this browser. It is never sent anywhere."
          confirmLabel="Unlock"
          run={unlockNow}
          onCancel={() => setPrompt(null)}
        >
          <div className="field-stack">
            {passwordField(
              "vault-unlock-pass",
              "Passphrase",
              "Spaces at the start and end are ignored.",
              first,
              setFirst,
              "current-password",
            )}
          </div>
        </VaultPrompt>
      ) : null}

      {prompt === "change" ? (
        <VaultPrompt
          title="Change the passphrase"
          message="The current passphrase is proved first, then a new salt and a new key are derived from the new one."
          consequences={[
            "Only the vault row is rewritten: this is not a re-encryption of what is stored.",
            "Records already sealed keep the envelope they were written with, so note bodies and files encrypted under the old passphrase stay unreadable under the new one.",
            "Copy or re-save anything that matters before changing it, because the old passphrase will no longer open those records.",
          ]}
          confirmLabel="Change passphrase"
          run={changePassphrase}
          onCancel={() => setPrompt(null)}
        >
          <div className="field-stack">
            {passwordField(
              "vault-current-pass",
              "Current passphrase",
              "The passphrase this notebook is sealed with now.",
              first,
              setFirst,
              "current-password",
            )}
            {passwordField(
              "vault-next-pass",
              "New passphrase",
              "At least " + MIN_PASSPHRASE + " characters. It is not stored anywhere.",
              second,
              setSecond,
              "new-password",
            )}
          </div>
        </VaultPrompt>
      ) : null}

      {prompt === "remove" ? (
        <VaultPrompt
          danger
          title="Turn off encryption?"
          message="The stored derivation parameters are deleted, and the key is dropped from this browser."
          consequences={[
            "The passphrase can no longer unlock anything, because the salt and the iteration count are what a key is derived from.",
            "Records already sealed keep their envelope, so note bodies and stored files encrypted with that passphrase stay unreadable.",
            "Nothing is deleted: titles, file names, folders and unsealed records are untouched.",
            "What is saved afterwards is plaintext, and note bodies are readable on the server as stored.",
          ]}
          confirmLabel="Turn off encryption"
          run={removeVault}
          onCancel={() => setPrompt(null)}
        >
          <span className="visually-hidden" />
        </VaultPrompt>
      ) : null}
    </dialog>
  );
}
