/**
 * components/Sidebar.tsx: the workspace switcher, the sort control and the tree.
 *
 * The rail carries one sort control for the whole notebook rather than one per list. The tree
 * and the pane are two drawings of the same rows, so a sort that applied to one of them would
 * be a sort the interface is lying about.
 */

import { useRef, useState } from 'react';
import type { JSX, MouseEvent } from 'react';
import Icon from './Icon';
import Select from './Select';
import Tree from './Tree';
import { ContextMenu } from './dialogs';
import type { MenuItem } from './dialogs';
import type { ContextItem as TreeMenuItem, TreeActions } from './Tree';
import { formatBytes } from '../lib/format';
import type { Attachment, Folder, Note, Sort, SortKey, Workspace, WorkspaceStats } from '../types';

/** The keys the sort menu offers, with the words the menu calls them. */
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'manual', label: 'Manual order' },
  { key: 'title', label: 'Title' },
  { key: 'created', label: 'Date created' },
  { key: 'updated', label: 'Date updated' },
];

/** What the button's own tooltip says, so the order is legible with no menu open. */
function sortLabel(sort: Sort): string {
  const entry = SORT_OPTIONS.find((option) => option.key === sort.key);
  return entry ? entry.label : sort.key;
}

export interface StorageReadout {
  usedBytes: number;
  noteCount: number;
  /** The quota the browser reported, when it reported one. */
  quotaBytes: number | null;
  stats: WorkspaceStats | null;
}

export interface SidebarProps {
  workspaces: Workspace[];
  workspaceId: string | null;
  onWorkspace: (id: string) => void;
  onAddWorkspace: () => void;
  onRenameWorkspace: () => void;
  onDeleteWorkspace: () => void;

  sort: Sort;
  onSort: (sort: Sort) => void;
  /** The row Move up and Move down act on, or null when there is nothing to move. */
  moveTarget: { label: string } | null;
  onMoveUp: () => void;
  onMoveDown: () => void;

  folders: Folder[];
  notes: Note[];
  attachments: Attachment[];
  expanded: Record<string, boolean>;
  selection: { type: 'all' | 'folder'; id: string | null };
  activeNoteId: string | null;
  activeAttachmentId: string | null;
  treeActions: TreeActions;

  storage: StorageReadout;
  /** One line about what is uploading, or null. */
  uploadStatus: string | null;
  onUploadClick: () => void;
  onNewNote: () => void;
  /** The storage readout is the way into the settings it explains. */
  onOpenSettings: () => void;
  /** The menu the tree asked for, rendered by the page. */
  onContextMenu: (x: number, y: number, title: string, items: TreeMenuItem[]) => void;
}

export default function Sidebar({
  workspaces,
  workspaceId,
  onWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  sort,
  onSort,
  moveTarget,
  onMoveUp,
  onMoveDown,
  folders,
  notes,
  attachments,
  expanded,
  selection,
  activeNoteId,
  activeAttachmentId,
  treeActions,
  storage,
  uploadStatus,
  onUploadClick,
  onNewNote,
  onOpenSettings,
  onContextMenu,
}: SidebarProps): JSX.Element {
  const [sortOpen, setSortOpen] = useState(false);
  const [sortAt, setSortAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const sortButton = useRef<HTMLButtonElement | null>(null);

  const ascending = sort.direction === 'asc';
  const sizeKey = sort.key === 'created' || sort.key === 'updated';
  const directionLabel = ascending
    ? sizeKey
      ? 'Oldest first'
      : 'Ascending'
    : sizeKey
      ? 'Newest first'
      : 'Descending';

  const quotaBytes = storage.quotaBytes && storage.quotaBytes > 0 ? storage.quotaBytes : null;
  const share = quotaBytes ? Math.min(1, storage.usedBytes / quotaBytes) : 0;
  // The meter's own share, never below 2%: a fill of zero pixels reads as "nothing here" rather
  // than as the small number it is.
  const meterWidth = Math.max(2, Math.round(share * 100));
  const nearQuota = share >= 0.8;

  const openSortMenu = (event: MouseEvent<HTMLButtonElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    setSortAt({ x: box.left, y: box.bottom + 6 });
    setSortOpen(true);
  };

  const sortItems: MenuItem[] = SORT_OPTIONS.map((option) => ({
    id: option.key,
    label: option.label,
    checked: option.key === sort.key,
    onSelect: () => onSort({ key: option.key, direction: sort.direction }),
  }));

  // Reordering sits apart from the sort keys: choosing an order and moving a row inside it are
  // two different acts, and one of them only exists in manual order. The commands are absent
  // rather than present-and-broken, because a list sorted by name would spring back the moment
  // it was redrawn.
  if (sort.key === 'manual' && moveTarget) {
    sortItems.push({ id: 'move-sep', label: '', separator: true });
    sortItems.push({
      id: 'move-up',
      label: 'Move up',
      shortcut: 'Alt+Up',
      onSelect: () => onMoveUp(),
    });
    sortItems.push({
      id: 'move-down',
      label: 'Move down',
      shortcut: 'Alt+Down',
      onSelect: () => onMoveDown(),
    });
  }

  sortItems.push({ id: 'direction-sep', label: '', separator: true });
  sortItems.push({
    id: 'direction',
    label: directionLabel,
    shortcut: ascending ? 'A to Z' : 'Z to A',
    onSelect: () => onSort({ key: sort.key, direction: ascending ? 'desc' : 'asc' }),
  });

  const noteCount = storage.noteCount || storage.stats?.notes || notes.length;
  const fileCount = storage.stats?.attachments ?? attachments.length;

  return (
    <aside className="sidebar" aria-label="Notebook navigation">
      <div className="sidebar__head">
        <div className="workspace-row">
          <div className="workspace-select-host">
            {/* The switcher is the app's own select: the native popup cannot carry the rail's
                glyph and chevron, and a visible trigger is what a reader actually clicks. */}
            <Select
              options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
              value={workspaceId ?? ''}
              onChange={onWorkspace}
              label="Workspace"
              lead="database"
              className="select--rail"
              disabled={!workspaces.length}
            />
          </div>
          <button
            className="icon-btn icon-btn--sm"
            type="button"
            title="New workspace"
            aria-label="New workspace"
            onClick={onAddWorkspace}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        <div className="workspace-tools">
          <button className="mini-btn" type="button" title="Rename this workspace" onClick={onRenameWorkspace}>
            <Icon name="pencil" size={13} />
            <span>Rename</span>
          </button>
          <button
            className="mini-btn mini-btn--danger"
            type="button"
            title="Delete this workspace and everything in it"
            onClick={onDeleteWorkspace}
          >
            <Icon name="trash" size={13} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <nav className="sidebar__section sidebar__section--grow" aria-label="Folders and notes">
        <div className="sidebar__label-row">
          <span className="sidebar__label">Contents</span>
          <button
            id="sort-menu"
            ref={sortButton}
            className={'sidebar__sort' + (sort.key === 'manual' ? ' is-manual' : '')}
            type="button"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            aria-label="Sort folders, notes and files"
            title={'Sorting by ' + sortLabel(sort) + (ascending ? ', ascending' : ', descending')}
            onClick={openSortMenu}
          >
            <Icon name="sort" size={14} />
          </button>
        </div>

        <Tree
          folders={folders}
          notes={notes}
          attachments={attachments}
          expanded={expanded}
          selection={selection}
          activeNoteId={activeNoteId}
          activeAttachmentId={activeAttachmentId}
          total={notes.length + attachments.length}
          actions={{ ...treeActions, onContextMenu }}
        />
      </nav>

      <div className="sidebar__footer">
        <p className={'upload-status' + (uploadStatus ? '' : ' is-hidden')} role="status">
          {uploadStatus ?? ''}
        </p>

        <div className="rail-actions">
          <button className="btn btn--primary btn--rail" type="button" onClick={onNewNote}>
            <Icon name="plus" size={14} />
            <span>New note</span>
          </button>
          <button className="btn btn--rail" type="button" onClick={onUploadClick}>
            <Icon name="upload" size={14} />
            <span>Upload</span>
          </button>
        </div>

        {/* The readout is a control rather than a caption: it is the way into the settings that
            say where the number comes from. The trash is not on this line, in the markup or in
            the stylesheet: it closes the workspace area's own corner, which is what it acts on. */}
        <button
          className={'rail-storage' + (nearQuota ? ' rail-storage--near' : '')}
          type="button"
          title={
            'Storage and settings. ' +
            noteCount + ' note' + (noteCount === 1 ? '' : 's') + ', ' +
            fileCount + ' file' + (fileCount === 1 ? '' : 's') + ' in ' +
            workspaces.length + ' workspace' + (workspaces.length === 1 ? '' : 's') + '.'
          }
          onClick={onOpenSettings}
        >
          <span className="rail-storage__icon" aria-hidden="true">
            <Icon name="database" size={13} />
          </span>
          <span className="rail-storage__text">
            <span className="rail-storage__size">{formatBytes(storage.usedBytes)}</span>
            <span className="rail-storage__label">
              {noteCount} note{noteCount === 1 ? '' : 's'}
            </span>
          </span>
          {/* A share of quota is a proportion, so it gets a meter and a percentage; without a
              quota the percentage would be a made-up number, so the file count is printed. */}
          {quotaBytes ? (
            <span className="rail-storage__meter" title="Share of the space the browser allows this site">
              <span className="rail-storage__fill" style={{ width: meterWidth + '%' }} />
            </span>
          ) : null}
          <span className={quotaBytes ? 'rail-storage__pct' : 'rail-storage__value'}>
            {quotaBytes
              ? meterWidth + '%'
              : fileCount + ' file' + (fileCount === 1 ? '' : 's')}
          </span>
        </button>
      </div>

      {sortOpen ? (
        <ContextMenu
          items={sortItems}
          x={sortAt.x}
          y={sortAt.y}
          title="Sort by"
          onClose={() => setSortOpen(false)}
        />
      ) : null}
    </aside>
  );
}

