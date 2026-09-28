/**
 * components/Topbar.tsx: the brand, the search field, and the view-level controls.
 *
 * There is one search field in the app and it lives here rather than beside the tree, because
 * the tree is drawn from its answer: a second copy would be a second query and a second state.
 */

import { useEffect, useRef } from 'react';
import Icon from './Icon';
import { usePreferences } from '../context/PreferencesContext';

export type WorkspaceView = 'notes' | 'tasks';

export interface TopbarProps {
  search: string;
  onSearch: (value: string) => void;
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  /** How many tasks are still open. Drawn on the view button, which is why it is a reason to look. */
  openTasks: number;
  /** Only meaningful under 820px: brings the list pane back in front of the detail pane. */
  onShowList: () => void;
  onSettings: () => void;
  /** The class name the mobile pane switch keys off. */
  isMobileList: boolean;
}

export default function Topbar({
  search,
  onSearch,
  view,
  onView,
  openTasks,
  onShowList,
  onSettings,
  isMobileList,
}: TopbarProps): JSX.Element {
  const { theme, setTheme } = usePreferences();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const brandRef = useRef<HTMLSpanElement | null>(null);
  const dark = theme === 'dark';

  // Ctrl+K is wired here rather than in the page because the field it focuses is this one.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      const node = searchRef.current;
      if (!node) return;
      node.focus();
      node.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The mark is drawn from the icon set into the brand tile, which the stylesheet paints with
  // the live accent. An empty tile would be a hole in the header.
  useEffect(() => {
    const host = brandRef.current;
    if (host && !host.firstChild) {
      host.textContent = 'NB';
    }
  }, []);

  return (
    <header className="topbar">
      <button
        className={'icon-btn nav-toggle' + (isMobileList ? '' : ' is-hidden')}
        type="button"
        aria-label="Show the notebook list"
        title="Show the notebook list"
        onClick={onShowList}
      >
        <Icon name="arrowLeft" size={16} />
      </button>

      <div className="topbar__brand">
        <span className="topbar__logo" ref={brandRef} aria-hidden="true" />
        <span className="topbar__name">Notebook</span>
      </div>

      <div className="topbar__search">
        <Icon name="search" size={14} />
        <input
          ref={searchRef}
          id="search"
          className="topbar__search-input"
          type="search"
          placeholder="Search notes and files  (Ctrl+K)"
          aria-label="Search notes and files"
          autoComplete="off"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.stopPropagation();
              onSearch('');
            }
          }}
        />
      </div>

      <div className="topbar__actions">
        <div className="topbar__views" role="group" aria-label="View">
          <button
            className={'view-btn' + (view === 'notes' ? ' is-active' : '')}
            type="button"
            aria-pressed={view === 'notes'}
            title="Notes"
            onClick={() => onView('notes')}
          >
            <Icon name="note" size={14} />
            <span className="view-btn__label">Notes</span>
          </button>
          <button
            className={'view-btn' + (view === 'tasks' ? ' is-active' : '')}
            type="button"
            aria-pressed={view === 'tasks'}
            title="Tasks"
            onClick={() => onView('tasks')}
          >
            <Icon name="checkCircle" size={14} />
            <span className="view-btn__label">Tasks</span>
            {openTasks > 0 ? <span className="tree__badge">{openTasks}</span> : null}
          </button>
        </div>

        <button
          className="icon-btn"
          type="button"
          aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
          title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
          onClick={() => setTheme(dark ? 'light' : 'dark')}
        >
          <Icon name={dark ? 'sun' : 'moon'} size={16} />
        </button>

        <button
          className="icon-btn"
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={onSettings}
        >
          <Icon name="settings" size={16} />
        </button>
      </div>
    </header>
  );
}
