/**
 * components/SearchResults.tsx: what one search found, from every workspace.
 *
 * The hits are drawn as the tree's own rows rather than as cards, because a result is a row of
 * the same list it was found in: the glyph, the name and the age in the same places. A hit that
 * came from another workspace says so in the trailing track the age would have used, since the
 * home of a row outranks its age and the two would overlap if drawn in the same column.
 */

import type { JSX, KeyboardEvent } from 'react';
import Icon from './Icon';
import type { SearchFileHit, SearchNoteHit, SearchResponse } from '../api/search';
import { extensionBadge, formatRelative } from '../lib/format';

export interface SearchResultsProps {
  term: string;
  /** Null until the answer arrives. */
  response: SearchResponse | null;
  /** The vault is on, so note bodies are sealed and only titles and names can be matched. */
  sealed: boolean;
  activeNoteId: string | null;
  activeFileId: string | null;
  /** The workspace on screen, which is what a hit's own home is compared against. */
  currentWorkspaceId: string | null;
  onOpenNote: (hit: SearchNoteHit) => void;
  onOpenFile: (hit: SearchFileHit) => void;
}

export default function SearchResults({
  term,
  response,
  sealed,
  activeNoteId,
  activeFileId,
  currentWorkspaceId,
  onOpenNote,
  onOpenFile,
}: SearchResultsProps): JSX.Element {
  const notes = response ? response.notes : [];
  const files = response ? response.files : [];
  const total = notes.length + files.length;

  /** Where a hit lives, when that is not the workspace on screen. */
  const homeOf = (workspaceId: string, name: string | null): string | null =>
    workspaceId === currentWorkspaceId ? null : name || 'Another workspace';

  const openOnKey = (event: KeyboardEvent<HTMLDivElement>, run: () => void): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    run();
  };

  return (
    <>
      <div className="search-head">
        {response === null ? (
          <span>Searching every workspace{"\u2026"}</span>
        ) : total ? (
          <span>
            <strong>{total}</strong>
            {total === 1 ? ' result for ' : ' results for '}
            {'\u201c' + term + '\u201d'}
          </span>
        ) : (
          <span>{'No results for \u201c' + term + '\u201d'}</span>
        )}
      </div>

      {/* What the search covered is part of the answer, not a footnote: a shorter list
          presented as the whole truth is the silent failure this must not have. */}
      {response !== null && !total ? (
        <p className="tree__hint">
          Nothing in any workspace matches. Search covers note titles, note text and file names.
        </p>
      ) : null}
      {response !== null && total && sealed ? (
        <p className="tree__hint">
          Note text is sealed while the vault is on, so this matched titles and file names only.
        </p>
      ) : null}

      {notes.map((hit) => {
        const home = homeOf(hit.workspace_id, hit.workspace_name);
        const title = hit.title.trim() || 'Untitled note';
        return (
          <div
            key={hit.id}
            className={'tree__row tree__row--note' + (hit.id === activeNoteId ? ' is-active' : '')}
            role="button"
            tabIndex={0}
            title={home ? title + ' \u00b7 ' + home : title}
            onClick={() => onOpenNote(hit)}
            onKeyDown={(event) => openOnKey(event, () => onOpenNote(hit))}
          >
            <span className="tree__glyph tree__glyph--note" aria-hidden="true">
              <Icon name="note" size={15} />
            </span>
            <span className="tree__label">{title}</span>
            {home ? (
              <span className="tree__ws">{home}</span>
            ) : (
              <span className="tree__when">{formatRelative(hit.updated_at)}</span>
            )}
          </div>
        );
      })}

      {files.map((hit) => {
        const home = homeOf(hit.workspace_id, hit.workspace_name);
        return (
          <div
            key={hit.id}
            className={'tree__row tree__row--file' + (hit.id === activeFileId ? ' is-active' : '')}
            role="button"
            tabIndex={0}
            title={hit.filename + (home ? ' \u00b7 ' + home : '')}
            onClick={() => onOpenFile(hit)}
            onKeyDown={(event) => openOnKey(event, () => onOpenFile(hit))}
          >
            <span className="tree__glyph tree__glyph--file" aria-hidden="true">
              {extensionBadge(hit.filename, hit.mime_type)}
            </span>
            <span className="tree__label">{hit.filename}</span>
            {home ? (
              <span className="tree__ws">{home}</span>
            ) : (
              <span className="tree__when">{formatRelative(hit.created_at)}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
