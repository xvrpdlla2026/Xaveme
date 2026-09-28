/**
 * components/dialogs.tsx: the confirm and prompt dialogs, built on a real <dialog>.
 *
 * A <dialog> gives focus trapping, Escape and scroll lock from the browser rather than from
 * hand-rolled listeners, which is the whole reason the reference app used one. Two things
 * are deliberate here:
 *
 *   - The dialog is mounted only while it is open, so the element is created on demand and
 *     cannot be left behind in the tree. Escape's close event and the calling code's own
 *     dismissal therefore converge on one path.
 *   - Failures submitted through onSubmit stay inside the dialog, next to the retry, rather
 *     than in a toast the reader may never connect to the action they just took.
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';

interface ShellProps {
  open: boolean;
  title: string;
  icon?: IconName;
  danger?: boolean;
  onCancel: () => void;
  children: ReactNode;
  footer: ReactNode;
  labelledBy: string;
}

/** The card every dialog in the app is drawn on. */
function DialogShell({
  open,
  title,
  icon,
  danger,
  onCancel,
  children,
  footer,
  labelledBy,
}: ShellProps): JSX.Element | null {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !open) return;
    if (!node.open) {
      try {
        node.showModal();
      } catch {
        // Already open, or the browser refused the top layer. The dialog still renders.
      }
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={'dialog' + (danger ? ' dialog--danger' : '')}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        // A form inside a dialog makes Escape trigger a request to close, which would take
        // the element out of the DOM without the caller knowing. It is handled as a cancel.
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        className="dialog__form"
        noValidate
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onCancel();
        }}
      >
        <div className="dialog__head">
          {icon ? (
            <span className="dialog__icon" aria-hidden="true">
              <Icon name={icon} />
            </span>
          ) : null}
          <h2 id={labelledBy} className="dialog__title">
            {title}
          </h2>
          <button className="dialog__close" type="button" aria-label="Close" onClick={onCancel}>
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="dialog__body">{children}</div>
        <div className="dialog__footer">{footer}</div>
      </form>
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** What the action actually destroys, one line each. A sentence buries this. */
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IconName;
  danger?: boolean;
  /** Return a promise to keep the dialog open with a busy footer until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** A yes/no question about something that cannot be undone quietly. */
export function ConfirmDialog({
  open,
  title,
  message,
  consequences,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = (): void => {
    setError(null);
    let result: void | Promise<void>;
    try {
      result = onConfirm();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'That did not work.');
      return;
    }
    if (result && typeof (result as Promise<void>).then === 'function') {
      setBusy(true);
      void (result as Promise<void>)
        .catch((thrown: unknown) => {
          setError(thrown instanceof Error ? thrown.message : 'That did not work.');
        })
        .finally(() => setBusy(false));
    }
  };

  return (
    <DialogShell
      open={open}
      title={title}
      {...(icon ? { icon } : {})}
      {...(danger ? { danger: true } : {})}
      onCancel={onCancel}
      labelledBy="dlg-confirm-title"
      footer={
        <>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={'btn ' + (danger ? 'btn--danger' : 'btn--primary')}
            type="button"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog__message">{message}</p>
      {consequences && consequences.length ? (
        <ul className="dialog__consequences">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="field__message field__message--error">{error}</p> : null}
    </DialogShell>
  );
}

export interface PromptDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  helper?: string;
  confirmLabel?: string;
  icon?: IconName;
  /** Refuse an empty value inline rather than sending it. */
  required?: boolean;
  emptyMessage?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/** One field, one answer. Used for every rename and every creation that needs a name. */
export function PromptDialog({
  open,
  title,
  label,
  initialValue = '',
  placeholder,
  helper,
  confirmLabel = 'Save',
  icon,
  required,
  emptyMessage,
  onSubmit,
  onCancel,
}: PromptDialogProps): JSX.Element | null {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus and pre-select the field once, when the dialog opens: a rename should be typed
  // over rather than appended to.
  useEffect(() => {
    if (!open) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, [open]);

  if (!open) return null;

  const submit = (event?: FormEvent): void => {
    if (event) event.preventDefault();
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError(emptyMessage ?? 'Enter a name to continue.');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    let result: void | Promise<void>;
    try {
      result = onSubmit(trimmed);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : 'That did not work.');
      return;
    }
    if (result && typeof (result as Promise<void>).then === 'function') {
      setBusy(true);
      void (result as Promise<void>)
        .catch((thrown: unknown) => {
          // Failures stay beside the field they belong to.
          setError(thrown instanceof Error ? thrown.message : 'That did not work.');
        })
        .finally(() => setBusy(false));
    }
  };

  return (
    <DialogShell
      open={open}
      title={title}
      {...(icon ? { icon } : {})}
      onCancel={onCancel}
      labelledBy="dlg-prompt-title"
      footer={
        <>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field__label" htmlFor="dlg-prompt-input">
          {label}
        </label>
        <div className="field__control">
          <input
            id="dlg-prompt-input"
            ref={inputRef}
            className="field__input"
            type="text"
            value={value}
            placeholder={placeholder ?? ''}
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        {error ? (
          <p className="field__message field__message--error">{error}</p>
        ) : helper ? (
          <p className="field__message">{helper}</p>
        ) : null}
      </div>
    </DialogShell>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** A separator is an item with no label: it is drawn as a rule. */
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuProps {
  items: MenuItem[];
  x: number;
  y: number;
  title?: string;
  onClose: () => void;
}

/**
 * The app's own menu, at a point in the viewport.
 *
 * Every entry carries behaviour that already exists elsewhere in the interface, so the menu
 * invents nothing: it is a second front door to the same actions, which is what keeps it from
 * drifting out of step with the rest of the app.
 */
export function ContextMenu({ items, x, y, title, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Clamped after measuring: an unmeasured box reports zero and lands in the corner.
    const box = node.getBoundingClientRect();
    const pad = 8;
    setPosition({
      left: Math.round(Math.max(pad, Math.min(x, window.innerWidth - box.width - pad))),
      top: Math.round(Math.max(pad, Math.min(y, window.innerHeight - box.height - pad))),
    });
  }, [x, y, items]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const node = ref.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const first = items.findIndex((item) => !item.separator && !item.disabled);

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      tabIndex={-1}
      aria-label={title ?? 'Actions'}
      style={{ left: position.left + 'px', top: position.top + 'px' }}
    >
      {title ? <div className="menu__title">{title}</div> : null}
      {items.map((item, index) => {
        if (item.separator) return <div key={item.id} className="menu__sep" role="separator" />;
        return (
          <button
            key={item.id}
            className={
              'menu__item' + (item.danger ? ' menu__item--danger' : '') + (item.disabled ? ' is-disabled' : '')
            }
            type="button"
            role="menuitem"
            autoFocus={index === first}
            disabled={item.disabled ?? false}
            onClick={() => {
              onClose();
              if (item.onSelect) item.onSelect();
            }}
          >
            <span className="menu__check">{item.checked ? <Icon name="check" size={13} /> : null}</span>
            {item.icon ? (
              <span className="menu__icon">
                <Icon name={item.icon} size={14} />
              </span>
            ) : null}
            <span className="menu__label">{item.label}</span>
            {item.shortcut ? <span className="menu__shortcut">{item.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
