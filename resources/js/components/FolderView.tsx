/**
 * components/FolderView.tsx: the main pane's listing for a folder, or for "All notes".
 *
 * A folder has no page of its own, so this is what the pane shows for one: the place named at
 * the top, every command that place also carries in its right-click menu, then what it holds,
 * subfolders first, then notes, then files, each as a card. Ported from the reference's
 * renderFolderView so the two apps describe a folder in the same words and the same order.
 */

import type { JSX } from 'react';
import Crumbs, { folderChain } from './Crumbs';
import Icon from './Icon';
import type { Selection, TreeActions } from './Tree';
import { extensionBadge, formatBytes, formatRelative, noteTitle } from '../lib/format';
import { isEnvelope } from '../lib/crypto';
import type { Attachment, Folder, Note } from '../types';

/** What a note card previews: the body's opening words, and never a sealed envelope. */
function snippetOf(note: Note): string {
  if (isEnvelope(note.content)) return 'Encrypted note';
  const text = (note.content ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 150 ? text.slice(0, 150) + '\u2026' : text;
}

export interface FolderViewProps {
  /** The name of the open workspace, which is what "All notes" is everything in. */
  workspaceName: string;
  selection: Selection;
  folders: Folder[];
  notes: Note[];
  attachments: Attachment[];
  activeNoteId: string | null;
  activeAttachmentId: string | null;
  /** The page's own upload control, which already targets the selected folder. */
  onUpload: () => void;
  actions: TreeActions;
}

export default function FolderView({
  workspaceName,
  selection,
  folders,
  notes,
  attachments,
  activeNoteId,
  activeAttachmentId,
  onUpload,
  actions,
}: FolderViewProps): JSX.Element {
  // The container being described: a folder, or the workspace root when "All notes" is selected.
  const folderId = selection.type === 'folder' ? selection.id : null;
  const folder = folderId ? folders.find((entry) => entry.id === folderId) ?? null : null;
  const chain = folderChain(folders, folderId);

  const foldersHere = folders.filter((entry) => (entry.parent_id ?? null) === folderId);
  const notesHere = notes.filter((entry) => (entry.folder_id ?? null) === folderId);
  const filesHere = attachments.filter((entry) => (entry.folder_id ?? null) === folderId);
  const empty = !foldersHere.length && !notesHere.length && !filesHere.length;

  return (
    <>
      <div className="pane-head">
        <h2 className="pane-head__title">{folder ? folder.name : 'All notes'}</h2>
        <p className="pane-head__sub">
          {folder ? (
            <Crumbs chain={chain} onSelect={(id) => actions.onSelect({ type: 'folder', id })} />
          ) : (
            'Everything in ' + workspaceName
          )}
        </p>
      </div>

      {/* Every command here is also in the right-click menu for the same surface, and both use
          the same glyph: a row of bare words leaves the eye to read all six to find the one
          that deletes something. */}
      {folder ? (
        <div className="pane-actions">
          <button className="btn btn--primary" type="button" onClick={() => actions.onNewNote(folder.id)}>
            <Icon name="note" size={14} />
            New note here
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => actions.onNewFolder(folder.id)}>
            <Icon name="folder" size={14} />
            New subfolder
          </button>
          <button className="btn btn--ghost" type="button" onClick={onUpload}>
            <Icon name="upload" size={14} />
            Upload file
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => actions.onRenameFolder(folder.id)}>
            <Icon name="pencil" size={14} />
            Rename
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => actions.onReparentFolder(folder.id)}>
            <Icon name="layers" size={14} />
            Move to workspace
          </button>
          <button className="btn btn--danger-ghost" type="button" onClick={() => actions.onDeleteFolder(folder.id)}>
            <Icon name="trash" size={14} />
            Delete folder
          </button>
        </div>
      ) : (
        <div className="pane-actions">
          <button className="btn btn--primary" type="button" onClick={() => actions.onNewNote(null)}>
            <Icon name="note" size={14} />
            New note
          </button>
          <button className="btn btn--ghost" type="button" onClick={() => actions.onNewFolder(null)}>
            <Icon name="folder" size={14} />
            New folder
          </button>
          <button className="btn btn--ghost" type="button" onClick={onUpload}>
            <Icon name="upload" size={14} />
            Upload file
          </button>
        </div>
      )}

      {/* Subfolders are listed here too, so a selected folder is navigable without the sidebar. */}
      {foldersHere.length ? (
        <>
          <h3 className="pane-section">
            <span>Subfolders</span>
            <span className="pane-section__count">{foldersHere.length}</span>
          </h3>
          <div className="card-grid">
            {foldersHere.map((entry) => (
              <button
                key={entry.id}
                className="card card--folder"
                type="button"
                title={'Show ' + entry.name}
                onClick={() => actions.onSelect({ type: 'folder', id: entry.id })}
              >
                <span className="card__glyph">
                  <Icon name="folder" />
                </span>
                <span className="card__title">{entry.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {notesHere.length ? (
        <>
          <h3 className="pane-section">
            <span>Notes</span>
            <span className="pane-section__count">{notesHere.length}</span>
          </h3>
          <div className="card-grid">
            {notesHere.map((note) => {
              const snippet = snippetOf(note);
              return (
                <button
                  key={note.id}
                  className={'card card--note' + (note.id === activeNoteId ? ' is-active' : '')}
                  type="button"
                  title={noteTitle(note)}
                  onClick={() => actions.onOpenNote(note.id)}
                >
                  <span className="card__title">{noteTitle(note)}</span>
                  <span className="card__snippet">{snippet || 'Empty note'}</span>
                  <span className="card__meta">{formatRelative(note.updated_at)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {filesHere.length ? (
        <>
          <h3 className="pane-section">
            <span>Files</span>
            <span className="pane-section__count">{filesHere.length}</span>
          </h3>
          <div className="card-grid">
            {filesHere.map((file) => (
              <button
                key={file.id}
                className={'card card--file' + (file.id === activeAttachmentId ? ' is-active' : '')}
                type="button"
                title={'Show ' + file.filename}
                onClick={() => actions.onOpenAttachment(file.id)}
              >
                <span className="card__glyph">{extensionBadge(file.filename, file.mime_type)}</span>
                <span className="card__title">{file.filename}</span>
                <span className="card__meta">
                  {formatBytes(file.size) + ' \u00b7 ' + formatRelative(file.created_at)}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {empty ? (
        <div className="empty-state">
          <h3>{folder ? 'This folder is empty' : 'This workspace is empty'}</h3>
          <p>
            {folder
              ? 'Add a note, drop a file here, or create a subfolder.'
              : 'Write the first note, or drop a file anywhere on the window to attach it.'}
          </p>
          <div className="empty-state__actions">
            <button className="btn btn--primary" type="button" onClick={() => actions.onNewNote(folderId)}>
              New note
            </button>
            <button className="btn btn--ghost" type="button" onClick={onUpload}>
              Upload file
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
