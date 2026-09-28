/**
 * components/Icon.tsx: the icon set, as inline SVG.
 *
 * The paths are hand-authored on one 24x24 grid at 1.6 stroke, matching the reference app's
 * set so the ported stylesheet's .icon rules apply unchanged. They are inline rather than
 * fetched because an icon that arrives late is a layout shift, and because the theme swap
 * has to repaint them with the live accent token.
 */

import type { JSX, SVGProps } from 'react';

export type IconName =
  | 'arrowLeft'
  | 'chart'
  | 'check'
  | 'checkCircle'
  | 'chevron'
  | 'close'
  | 'copy'
  | 'database'
  | 'download'
  | 'emptyTrash'
  | 'external'
  | 'eye'
  | 'file'
  | 'filter'
  | 'folder'
  | 'info'
  | 'layers'
  | 'moon'
  | 'note'
  | 'pencil'
  | 'plus'
  | 'restore'
  | 'search'
  | 'server'
  | 'settings'
  | 'sort'
  | 'spinner'
  | 'sun'
  | 'trash'
  | 'upload'
  | 'warning';

/**
 * One entry per glyph. Each string is one path, stroked and never filled: a filled path in a
 * set drawn for stroke weight is the thing that makes an icon look borrowed.
 */
const PATHS: Record<IconName, string[]> = {
  close: ['M6.5 6.5 17.5 17.5', 'M17.5 6.5 6.5 17.5'],
  search: ['M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'M15.8 15.8 20 20'],
  check: ['M5 12.8 9.4 17 19 7'],
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  upload: ['M12 16V5.5', 'M8 9.5 12 5.5l4 4', 'M5.5 16.5v1.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-1.5'],
  trash: [
    'M4.5 7h15',
    'M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7',
    'M6.5 7l0.9 11.5a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
    'M10.5 10.5v6',
    'M13.5 10.5v6',
  ],
  pencil: ['M13.5 20.5H20', 'M16.6 4.4a1.6 1.6 0 0 1 2.3 0l0.7 0.7a1.6 1.6 0 0 1 0 2.3L9 18l-3.6 1 1-3.6Z'],
  folder: ['M4 7.5A1.5 1.5 0 0 1 5.5 6h3.2a1.5 1.5 0 0 1 1.2.6l0.9 1.2h7.7A1.5 1.5 0 0 1 20 9.3v8.2A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z'],
  note: ['M6 4.5h7.5L18.5 9.5V19a0.5 0.5 0 0 1-0.5 0.5H6a0.5 0.5 0 0 1-0.5-0.5V5a0.5 0.5 0 0 1 0.5-0.5Z', 'M13 4.5V10h5.5', 'M8.5 13.5h6'],
  file: ['M13.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8Z', 'M13.5 3.5V8H18'],
  layers: ['M12 3.5 3.5 8.5 12 13.5l8.5-5Z', 'M3.5 13 12 18l8.5-5'],
  warning: ['M12 4.5 21 19.5H3Z', 'M12 10.5v4.5', 'M12 17.6h.01'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z', 'M12 11.5v5', 'M12 8.2h.01'],
  database: [
    'M12 3.5c4.4 0 8 1.2 8 2.6S16.4 8.7 12 8.7 4 7.5 4 6.1 7.6 3.5 12 3.5Z',
    'M4 6.1v5.8c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V6.1',
    'M4 11.9v6c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6v-6',
  ],
  server: ['M4 5.5h16v5H4Z', 'M4 13.5h16v5H4Z', 'M7.2 8h.01', 'M7.2 16h.01'],
  chevron: ['M6.5 9.5 12 15l5.5-5.5'],
  // Two control rails with their knobs: a gear at this stroke weight closes its own valleys.
  settings: [
    'M4 8.6h16',
    'M4 15.4h16',
    'M11.7 8.6a2.1 2.1 0 1 0-4.2 0 2.1 2.1 0 1 0 4.2 0Z',
    'M14.4 15.4a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 1 0-4.2 0Z',
  ],
  sun: [
    'M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z',
    'M12 2.6v2.3',
    'M12 19.1v2.3',
    'M4.4 4.4 6 6',
    'M18 18l1.6 1.6',
    'M2.6 12h2.3',
    'M19.1 12h2.3',
    'M4.4 19.6 6 18',
    'M18 6l1.6-1.6',
  ],
  moon: ['M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z'],
  arrowLeft: ['M19 12H5.5', 'M11 5.5 4.5 12l6.5 6.5'],
  spinner: ['M12 4.5a7.5 7.5 0 1 0 7.5 7.5'],
  restore: ['M3.6 12a8.4 8.4 0 1 0 2.5-6', 'M3.2 3.6V9h5.4', 'M12 7.9V12l3 1.7'],
  filter: ['M4 6h16', 'M7 12h10', 'M10 18h4'],
  sort: ['M7 5v14', 'M4 16l3 3 3-3', 'M17 19V5', 'M14 8l3-3 3 3'],
  external: ['M14 4.5h5.5V10', 'M19.5 4.5 11 13', 'M18 14.5v4a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4'],
  download: ['M12 4.5V15', 'M8 11l4 4 4-4', 'M5 19.5h14'],
  copy: ['M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5Z', 'M15.5 5.5H6A1.5 1.5 0 0 0 4.5 7v9.5'],
  eye: ['M2.6 12S6.4 5.8 12 5.8 21.4 12 21.4 12 17.6 18.2 12 18.2 2.6 12 2.6 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  checkCircle: ['M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Z', 'M8.4 12.2l2.6 2.6 4.8-5.2'],
  emptyTrash: [
    'M4.5 7h15',
    'M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7',
    'M6.5 7l0.9 11.5a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7',
    'M9.8 10.5l4.4 6',
    'M14.2 10.5l-4.4 6',
  ],
  chart: ['M4 20.5h16', 'M7 20.5v-6', 'M12 20.5V7.5', 'M17 20.5v-3.5'],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** The square size in pixels. The stylesheet may override it through .icon. */
  size?: number;
}

export default function Icon({ name, size = 16, className, ...rest }: IconProps): JSX.Element {
  const paths = PATHS[name];
  const classes = 'icon' + (name === 'spinner' ? ' icon--spin' : '') + (className ? ' ' + className : '');
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ fontSize: size }}
      {...rest}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
