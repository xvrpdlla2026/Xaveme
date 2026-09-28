/**
 * components/Crumbs.tsx: a path whose every step is a place to go.
 *
 * A pane that names a location as a caption tells the reader where a thing is and then leaves
 * them to walk back to it by hand, which from three folders down is the whole journey. Each
 * folder is a button that selects it in the tree; the item itself is the trailing step and is a
 * label, not a target, because it is the thing already open in the pane this is drawn in.
 */

import type { JSX } from 'react';
import type { Folder } from '../types';

/** How deep a chain is read before a corrupted parent cycle is left alone. */
const CHAIN_LIMIT = 32;

/** A folder's ancestors, outermost first, which is the order a path is written in. */
export function folderChain(folders: Folder[], id: string | null): Folder[] {
  const chain: Folder[] = [];
  let current: string | null = id;
  let guard = 0;
  while (current && guard < CHAIN_LIMIT) {
    const folder = folders.find((entry) => entry.id === current);
    if (!folder) break;
    chain.unshift(folder);
    current = folder.parent_id ?? null;
    guard += 1;
  }
  return chain;
}

export interface CrumbsProps {
  chain: Folder[];
  /** The trailing step, which is a label rather than a target. */
  item?: string | null;
  onSelect: (folderId: string) => void;
}

export default function Crumbs({ chain, item, onSelect }: CrumbsProps): JSX.Element | null {
  if (!chain.length && !item) return null;
  return (
    <>
      {chain.map((step, index) => (
        <span key={step.id}>
          {/* The separator is part of the path, so it is written between the steps rather than
              after each one: a chain with no item after it then ends on a folder, not a slash. */}
          {index ? <span className="crumb__sep"> / </span> : null}
          <button
            className="crumb"
            type="button"
            title={'Show ' + step.name + ' in the tree'}
            onClick={() => onSelect(step.id)}
          >
            {step.name}
          </button>
        </span>
      ))}
      {item ? (
        <span>
          {chain.length ? <span className="crumb__sep"> / </span> : null}
          <span className="crumb crumb--current">{item}</span>
        </span>
      ) : null}
    </>
  );
}
