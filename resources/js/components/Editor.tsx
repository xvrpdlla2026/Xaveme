/**
 * components/Editor.tsx: the open note.
 *
 * Autosave is the whole design here. The 500 ms window is the reference app's figure, and
 * the flush is what makes it safe: switching notes, hiding the tab or pressing Ctrl+S runs
 * the pending write immediately rather than losing the last few keystrokes.
 *
 * The status line is not decoration. It is the only thing that distinguishes "your typing
 * has been written" from "your typing is still in flight", and a note editor without it
 * teaches the reader to distrust every pause.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import Icon from './Icon';
import { debounce } from '../lib/idle';
import { formatClock, formatRelative, formatStamp } from '../lib/format';
import type { Note } from '../types';

/** How long typing rests before the note is written. */
const SAVE_DEBOUNCE_MS = 500;

/** The vault's state as the editor needs to know it. */
export type EditorVaultState = 'off' | 'locked' | 'unlocked';

export type EditorSave = (
  patch: { title: string; content: string },
  mode: 'auto' | 'manual',
) => Promise<void>;

export interface EditorProps {
  note: Note;
  vaultState: EditorVaultState;
  /** Whether the signed-in user may delete. Always true today; kept explicit for the read paths. */
  canEdit: boolean;
  onSave: EditorSave;
  /** Delete to trash. The workspace confirms and refreshes. */
  onDelete: () => void;
  /** Ask for the passphrase, from the lock notice. */
  onUnlock: () => void;
}

export default function Editor({
  note,
  vaultState,
  canEdit,
  onSave,
  onDelete,
  onUnlock,
}: EditorProps): JSX.Element {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [status, setStatus] = useState<string>('Saved');
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);

  // The note the fields currently describe. A save that resolves after the reader moved on
  // must not stamp its result onto somebody else's editor.
  const openIdRef = useRef(note.id);
  const draftRef = useRef({ title: note.title, content: note.content });

  const locked = vaultState === 'locked';
  const sealed = vaultState !== 'off';

  // Reopen the fields when the note changes. This is a render-time reset keyed to the id
  // rather than an effect, so a repaint never shows the previous note for one frame.
  const [shownId, setShownId] = useState(note.id);
  if (shownId !== note.id) {
    setShownId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setStatus('Saved');
    setDirty(false);
    setFailed(false);
    openIdRef.current = note.id;
    draftRef.current = { title: note.title, content: note.content };
  }

  const write = useCallback(
    async (mode: 'auto' | 'manual'): Promise<void> => {
      const draft = draftRef.current;
      const id = openIdRef.current;
      setDirty(true);
      setFailed(false);
      if (mode === 'manual') setStatus('Saving...');
      try {
        await onSave(draft, mode);
        if (openIdRef.current !== id) return;
        setDirty(false);
        setStatus('Saved ' + formatClock(new Date()));
      } catch (error) {
        if (openIdRef.current !== id) return;
        setDirty(true);
        setFailed(true);
        setStatus(error instanceof Error ? 'Save failed: ' + error.message : 'Save failed');
      }
    },
    [onSave],
  );

  // The debounced save reads the current writer through a ref, so a re-render caused by
  // typing never restarts the timer and a stale closure never writes the wrong draft.
  const writeRef = useRef(write);
  writeRef.current = write;
  const scheduled = useMemo(() => debounce(() => void writeRef.current('auto'), SAVE_DEBOUNCE_MS), []);

  useEffect(() => () => scheduled.cancel(), [scheduled]);

  // The reader leaving the note, hiding the tab or closing it flushes what is pending.
  useEffect(() => {
    const flush = (): void => {
      if (scheduled.pending()) scheduled.flush();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [scheduled, note.id]);

  const onChangeTitle = (value: string): void => {
    setTitle(value);
    draftRef.current = { title: value, content: draftRef.current.content };
    setDirty(true);
    setStatus('Unsaved...');
    scheduled();
  };

  const onChangeContent = (value: string): void => {
    setContent(value);
    draftRef.current = { title: draftRef.current.title, content: value };
    setDirty(true);
    setStatus('Unsaved...');
    scheduled();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      // Ctrl+S: the browser's save-page dialog is never what is wanted here.
      event.preventDefault();
      scheduled.cancel();
      void write('manual');
      return;
    }
    if (event.key === 'Tab') {
      // A note is plain text, and a tab is a thing people type in plain text.
      event.preventDefault();
      const area = event.currentTarget;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const next = content.slice(0, start) + '\t' + content.slice(end);
      onChangeContent(next);
      window.requestAnimationFrame(() => {
        area.selectionStart = start + 1;
        area.selectionEnd = start + 1;
      });
    }
  };

  const heading = title.trim() ? title : 'Untitled note';
  // The status dot carries three states, and the words carry them too: colour alone is not
  // a message for a reader who cannot see it.
  const statusClass =
    'editor__status' + (failed ? ' editor__status--error' : dirty ? ' editor__status--dirty' : '');

  return (
    <div className="editor">
      <div className="pane-head">
        <span className="pane-head__glyph" aria-hidden="true">
          <Icon name="note" size={18} />
        </span>
        <div className="pane-head__text">
          <h2 className="pane-head__title">{heading}</h2>
          <p className="pane-head__sub">
            {sealed ? 'Encrypted: title visible, body sealed' : 'Plain text, stored on the server'}
          </p>
        </div>
        <div className="pane-head__stamp">
          <span id="note-status" className={statusClass} role="status">
            {status}
          </span>
        </div>
      </div>

      {locked ? (
        <div className="lock-notice">
          <span className="lock-notice__mark" aria-hidden="true">
            <Icon name="warning" size={22} />
          </span>
          <div className="lock-notice__text">
            <h3>This notebook is locked</h3>
            <p>The note body is stored as sealed text. Unlock the vault to read and edit it.</p>
          </div>
          <button className="btn btn--primary" type="button" onClick={onUnlock}>
            Unlock
          </button>
        </div>
      ) : (
        <>
          <input
            id="note-title"
            className="editor__title"
            type="text"
            value={title}
            placeholder="Untitled note"
            aria-label="Note title"
            autoComplete="off"
            readOnly={!canEdit}
            onChange={(event) => onChangeTitle(event.target.value)}
            onBlur={() => {
              if (scheduled.pending()) {
                scheduled.cancel();
                void write('manual');
              }
            }}
          />

          <textarea
            id="note-body"
            className="editor__body"
            value={content}
            placeholder="Write the note here. It saves on its own."
            aria-label="Note body"
            spellCheck
            readOnly={!canEdit}
            onChange={(event) => onChangeContent(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </>
      )}

      <div className="editor__meta">
        <span className="editor__meta-when">created {formatStamp(note.created_at)}</span>
        <span className="editor__meta-when">
          updated {formatRelative(note.updated_at)}
          {note.updated_at ? ' (' + formatStamp(note.updated_at) + ')' : ''}
        </span>
      </div>

      <div className="editor__toolbar">
        <div className="editor__buttons">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              scheduled.cancel();
              void write('manual');
            }}
          >
            Save now
          </button>
          <button className="btn btn--danger-ghost" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
