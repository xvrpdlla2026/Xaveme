/**
 * components/EmptyState.tsx: the one drawing of "there is nothing here".
 *
 * Every list in the app ends up here eventually, so it is one component rather than a
 * paragraph written five times. The actions are passed in, because what a reader can do
 * next depends on which list is empty.
 */

import type { JSX, ReactNode } from 'react';

export interface EmptyStateProps {
  /** A short mark above the copy: two letters, or a glyph. Omitted when there is none. */
  mark?: string;
  body?: string;
  /** Buttons or links. Omitted when there is nothing useful to offer. */
  actions?: ReactNode;
  /** The larger variant, used when the empty list is the whole pane. */
  big?: boolean;
}

export default function EmptyState({ mark, body, actions, big }: EmptyStateProps): JSX.Element {
  return (
    <div className={'empty-state' + (big ? ' empty-state--big' : '')}>
      {mark ? (
        <span className="empty-state__mark" aria-hidden="true">
          {mark}
        </span>
      ) : null}
      {body ? <p className="empty-state__body">{body}</p> : null}
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  );
}
