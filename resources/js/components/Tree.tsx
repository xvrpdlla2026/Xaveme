/**
 * components/Tree.tsx: the nested folder tree.
 *
 * Folders recurse by parent_id, and notes and attachments are drawn inside whichever folder
 * holds them (a null folder_id is the workspace root). Three things the reference app does
 * are preserved exactly, because the stylesheet ported beside this file depends on them:
 *
 *   - the row classes, so a row is a row wherever it comes from;
 *   - the indent is a --indent custom property rather than a padding, so the guide rails
 *     drawn by ::before can follow it;
 *   - the open, selected and active states are classes on the row, never inline styles.
 *
 * Rows are focusable divs rather than buttons, which is what lets a row contain its own
 * twisty button and its own trailing count without nesting controls.
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';
import { extensionBadge, formatBytes, formatRelative, noteTitle } from '../lib/format';
import type { Attachment, Folder, Note } from '../types';

/** The drag payload types. One per kind, so a drop target can tell what is arriving. */
export const DRAG_FOLDER = 'application/x-notebook-folder';
export const DRAG_NOTE = 'application/x-notebook-note';
export const DRAG_ATTACHMENT = 'application/x-notebook-attachment';

export type Selection = { type: 'all' | 'folder'; id: string | null };

export interface TreeActions {
  onSelect: (selection: Selection) => void;
  onToggleFolder: (id: string) => void;
  onOpenNote: (id: string) => void;
  onOpenAttachment: (id: string) => void;
  onNewNote: (folderId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onRenameFolder: (id: string) => void;
  /** Move the folder into another folder, from the context menu. */
  onReparentFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onRenameAttachment: (id: string) => void;
  onDeleteAttachment: (id: string) => void;
  /** Drag to move: the item arrives in the folder, or at the root when folderId is null. */
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onMoveAttachment: (attachmentId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
  /** The app's own menu, at a point in the viewport. */
  onContextMenu: (x: number, y: number, title: string, items: ContextItem[]) => void;
}

export interface ContextItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

export interface TreeProps {
  folders: Folder[];
  notes: Note[];
  attachments: Attachment[];
  expanded: Record<string, boolean>;
  selection: Selection;
  activeNoteId: string | null;
  activeAttachmentId: string | null;
  /** Total for the root row's badge. */
  total: number;
  actions: TreeActions;
}

const DEPTH_LIMIT = 16;

function indentStyle(depth: number): { ['--indent']: string } {
  return { '--indent': depth * 14 + 'px' };
}

function depthClass(depth: number): string {
  return depth > 0 ? ' tree__row--nested' : '';
}

/** Read the first of the app's own drag types that is present. */
function draggedId(event: DragEvent, type: string): string | null {
  const value = event.dataTransfer.getData(type);
  return value ? value : null;
}

function hasType(event: DragEvent, type: string): boolean {
  const types = event.dataTransfer.types;
  for (let i = 0; i < types.length; i += 1) {
    if (types[i] === type) return true;
  }
  return false;
}

export default function Tree({
  folders,
  notes,
  attachments,
  expanded,
  selection,
  activeNoteId,
  activeAttachmentId,
  total,
  actions,
}: TreeProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const foldersOf = useCallback(
    (parentId: string | null): Folder[] => folders.filter((folder) => (folder.parent_id ?? null) === parentId),
    [folders],
  );

  const notesOf = useCallback(
    (folderId: string | null): Note[] => notes.filter((note) => (note.folder_id ?? null) === folderId),
    [notes],
  );

  const attachmentsOf = useCallback(
    (folderId: string | null): Attachment[] =>
      attachments.filter((attachment) => (attachment.folder_id ?? null) === folderId),
    [attachments],
  );

  /** Keyboard parity for rows: arrows walk the tree, Left and Right fold and unfold. */
  const onRowKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, folder: Folder | null): void => {
      const host = hostRef.current;
      if (!host) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const rows = Array.from(host.querySelectorAll<HTMLElement>('.tree__row'));
        const current = event.currentTarget;
        const index = rows.indexOf(current);
        const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
        if (next) next.focus();
        return;
      }
      if (!folder) return;
      if (event.key === 'ArrowRight' && !expanded[folder.id]) {
        event.preventDefault();
        actions.onToggleFolder(folder.id);
      }
      if (event.key === 'ArrowLeft' && expanded[folder.id]) {
        event.preventDefault();
        actions.onToggleFolder(folder.id);
      }
    },
    [actions, expanded],
  );

  /** The drop handlers a folder row and the root row share. */
  const dropHandlers = useCallback(
    (folderId: string | null, key: string): HTMLAttributes<HTMLDivElement> => ({
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        const types = [DRAG_FOLDER, DRAG_NOTE, DRAG_ATTACHMENT];
        if (!types.some((type) => hasType(event, type))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: () => {
        setDropTarget((current) => (current === key ? null : current));
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        setDropTarget(null);
        const folderMovable = draggedId(event, DRAG_FOLDER);
        const noteId = draggedId(event, DRAG_NOTE);
        const attachmentId = draggedId(event, DRAG_ATTACHMENT);
        if (!folderMovable && !noteId && !attachmentId) return;
        event.preventDefault();
        event.stopPropagation();
        if (folderMovable && folderMovable !== folderId) actions.onMoveFolder(folderMovable, folderId);
        if (noteId) actions.onMoveNote(noteId, folderId);
        if (attachmentId) actions.onMoveAttachment(attachmentId, folderId);
      },
    }),
    [actions, dropTarget],
  );

  const folderMenu = (folder: Folder): ContextItem[] => [
    { id: 'new-note', label: 'New note', icon: 'note', onSelect: () => actions.onNewNote(folder.id) },
    { id: 'new-folder', label: 'New subfolder', icon: 'folder', onSelect: () => actions.onNewFolder(folder.id) },
    { id: 'rename', label: 'Rename', icon: 'pencil', onSelect: () => actions.onRenameFolder(folder.id) },
    { id: 'move', label: 'Move into another folder', icon: 'external', onSelect: () => actions.onReparentFolder(folder.id) },
    { id: 'delete', label: 'Delete folder', icon: 'trash', danger: true, onSelect: () => actions.onDeleteFolder(folder.id) },
  ];

  const noteMenu = (note: Note): ContextItem[] => [
    { id: 'open', label: 'Open note', icon: 'note', onSelect: () => actions.onOpenNote(note.id) },
    { id: 'rename', label: 'Rename', icon: 'pencil', onSelect: () => actions.onRenameNote(note.id) },
    { id: 'delete', label: 'Move to trash', icon: 'trash', danger: true, onSelect: () => actions.onDeleteNote(note.id) },
  ];

  const attachmentMenu = (attachment: Attachment): ContextItem[] => [
    { id: 'open', label: 'Preview file', icon: 'eye', onSelect: () => actions.onOpenAttachment(attachment.id) },
    { id: 'rename', label: 'Rename', icon: 'pencil', onSelect: () => actions.onRenameAttachment(attachment.id) },
    { id: 'delete', label: 'Move to trash', icon: 'trash', danger: true, onSelect: () => actions.onDeleteAttachment(attachment.id) },
  ];

  function noteRow(note: Note, depth: number): ReactNode {
    const title = noteTitle(note);
    const active = note.id === activeNoteId;
    return (
      <div
        key={note.id}
        className={'tree__row tree__row--note' + depthClass(depth) + (active ? ' is-active' : '')}
        role="treeitem"
        tabIndex={0}
        aria-selected={active}
        draggable
        style={indentStyle(depth)}
        title={title}
        onClick={() => actions.onOpenNote(note.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.onOpenNote(note.id);
          } else {
            onRowKey(event, null);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_NOTE, note.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          actions.onContextMenu(event.clientX, event.clientY, title, noteMenu(note));
        }}
      >
        <span className="tree__glyph tree__glyph--note" aria-hidden="true">
          <Icon name="note" size={15} />
        </span>
        <span className="tree__label">{title}</span>
        {active ? <span className="tree__when">{formatRelative(note.updated_at)}</span> : null}
      </div>
    );
  }

  function attachmentRow(attachment: Attachment, depth: number): ReactNode {
    const active = attachment.id === activeAttachmentId;
    const when = formatRelative(attachment.created_at);
    return (
      <div
        key={attachment.id}
        className={'tree__row tree__row--file' + depthClass(depth) + (active ? ' is-active' : '')}
        role="treeitem"
        tabIndex={0}
        aria-selected={active}
        draggable
        style={indentStyle(depth)}
        title={attachment.filename + ' · ' + formatBytes(attachment.size) + (when ? ' · added ' + when : '')}
        onClick={() => actions.onOpenAttachment(attachment.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.onOpenAttachment(attachment.id);
          } else {
            onRowKey(event, null);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_ATTACHMENT, attachment.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          actions.onContextMenu(event.clientX, event.clientY, attachment.filename, attachmentMenu(attachment));
        }}
      >
        <span className="tree__glyph tree__glyph--file" aria-hidden="true">
          {extensionBadge(attachment.filename, attachment.mime_type)}
        </span>
        <span className="tree__label">{attachment.filename}</span>
      </div>
    );
  }

  function folderLevel(parentId: string | null, depth: number): ReactNode[] {
    if (depth > DEPTH_LIMIT) return [];
    const rows: ReactNode[] = [];

    foldersOf(parentId).forEach((folder) => {
      const isOpen = !!expanded[folder.id];
      const selected = selection.type === 'folder' && selection.id === folder.id;
      const direct = notesOf(folder.id).length + attachmentsOf(folder.id).length;
      const key = folder.id;

      rows.push(
        <div
          key={folder.id}
          className={
            'tree__row tree__row--folder' +
            depthClass(depth) +
            (selected ? ' is-active' : '') +
            (isOpen ? ' is-expanded' : '') +
            (dropTarget === key ? ' is-drop-target' : '')
          }
          role="treeitem"
          tabIndex={0}
          aria-selected={selected}
          aria-expanded={isOpen}
          draggable
          style={indentStyle(depth)}
          title={folder.name}
          onClick={() => actions.onSelect({ type: 'folder', id: folder.id })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              actions.onSelect({ type: 'folder', id: folder.id });
            } else {
              onRowKey(event, folder);
            }
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_FOLDER, folder.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            actions.onContextMenu(event.clientX, event.clientY, folder.name, folderMenu(folder));
          }}
          {...dropHandlers(folder.id, key)}
        >
          <button
            className={'tree__twisty' + (isOpen ? ' is-expanded' : '')}
            type="button"
            tabIndex={-1}
            aria-expanded={isOpen}
            title={isOpen ? 'Collapse' : 'Expand'}
            onClick={(event) => {
              // The arrow's whole purpose is the narrower intent: toggle without selecting.
              event.stopPropagation();
              actions.onToggleFolder(folder.id);
            }}
          >
            <span className="tree__glyph-chevron" aria-hidden="true" />
            <span className="visually-hidden">{(isOpen ? 'Collapse ' : 'Expand ') + folder.name}</span>
          </button>
          <span className="tree__glyph tree__glyph--folder" aria-hidden="true">
            <Icon name="folder" size={15} />
          </span>
          <span className="tree__label">{folder.name}</span>
          {direct > 0 ? <span className="tree__count">{direct}</span> : null}
        </div>,
      );

      if (!isOpen) return;

      const childFolders = folderLevel(folder.id, depth + 1);
      const childNotes = notesOf(folder.id).map((note) => noteRow(note, depth + 1));
      const childFiles = attachmentsOf(folder.id).map((attachment) => attachmentRow(attachment, depth + 1));

      rows.push(...childFolders, ...childNotes, ...childFiles);

      if (!childFolders.length && !childNotes.length && !childFiles.length) {
        rows.push(
          <div key={folder.id + '-empty'} className="tree__empty" style={indentStyle(depth + 1)}>
            empty
          </div>,
        );
      }
    });

    return rows;
  }

  const rootNotes = notesOf(null);
  const rootFiles = attachmentsOf(null);
  const rootSelected = selection.type === 'all';

  return (
    <div className="tree" role="tree" aria-label="Folders, notes and files" ref={hostRef}>
      <div
        className={
          'tree__row tree__row--root' +
          (rootSelected ? ' is-active' : '') +
          (dropTarget === 'root' ? ' is-drop-target' : '')
        }
        role="treeitem"
        tabIndex={0}
        aria-selected={rootSelected}
        title="Everything in this workspace"
        onClick={() => actions.onSelect({ type: 'all', id: null })}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            actions.onSelect({ type: 'all', id: null });
          } else {
            onRowKey(event, null);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          actions.onContextMenu(event.clientX, event.clientY, 'This workspace', [
            { id: 'new-note', label: 'New note', icon: 'note', onSelect: () => actions.onNewNote(null) },
            { id: 'new-folder', label: 'New folder', icon: 'folder', onSelect: () => actions.onNewFolder(null) },
          ]);
        }}
        {...dropHandlers(null, 'root')}
      >
        <span className="tree__glyph" aria-hidden="true">
          <Icon name="layers" size={15} />
        </span>
        <span className="tree__label">All notes</span>
        <span className="tree__badge">{total}</span>
      </div>

      {!folders.length && !notes.length && !attachments.length ? (
        <p className="tree__hint">No folders yet. Create one to get organised.</p>
      ) : null}

      {folderLevel(null, 0)}

      {rootNotes.map((note) => noteRow(note, 0))}
      {rootFiles.map((attachment) => attachmentRow(attachment, 0))}
    </div>
  );
}
