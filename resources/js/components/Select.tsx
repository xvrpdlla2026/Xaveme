/**
 * components/Select.tsx: the app's own select, ported from the reference.
 *
 * A native <select> stays in the DOM as the real form control, but the visible surface is a
 * button and a listbox: the native popup cannot be styled, and the rail's workspace switcher
 * has to look like the rest of the rail. The native control is kept for the platform picker
 * and for assistive tech, and every visible interaction happens on the trigger.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  /** The chosen value, announced the moment it changes. */
  onChange: (value: string) => void;
  /** The control's accessible name, which is also the native select's own label. */
  label: string;
  /** A leading glyph, the way the rail's other controls have one. */
  lead?: IconName;
  className?: string;
  disabled?: boolean;
}

export default function Select({
  options,
  value,
  onChange,
  label,
  lead,
  className,
  disabled,
}: SelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const chosen = options.find((option) => option.value === value) ?? null;

  const close = useCallback((refocus: boolean): void => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (next: string): void => {
      setOpen(false);
      onChange(next);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const indexOf = useCallback(
    (candidate: string): number => Math.max(0, options.findIndex((option) => option.value === candidate)),
    [options],
  );

  // The list takes focus while it is open, which is what gives the arrow keys somewhere to land.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // A click anywhere else closes it, which is the contract every other popup here keeps.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent): void => {
      const node = event.target as Node;
      if (listRef.current?.contains(node) || triggerRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const move = (next: number): void => {
    const index = Math.min(options.length - 1, Math.max(0, next));
    setActiveIndex(index);
    const node = listRef.current?.children[index];
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(activeIndex + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(activeIndex - 1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      move(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      move(options.length - 1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) commit(option.value);
    }
  };

  return (
    <div className={'select' + (className ? ' ' + className : '')}>
      <select
        className="select__native"
        tabIndex={-1}
        aria-hidden="true"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        ref={triggerRef}
        className="select__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        title={chosen ? chosen.label : label}
        onClick={() => {
          if (open) close(false);
          else if (options.length) {
            setActiveIndex(indexOf(value));
            setOpen(true);
          }
        }}
      >
        {lead ? (
          <span className="select__lead" aria-hidden="true">
            <Icon name={lead} size={15} />
          </span>
        ) : null}
        <span className="select__value">{chosen ? chosen.label : ''}</span>
        <span className="select__chevron" aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
      </button>

      {open ? (
        <ul className="select__list" role="listbox" tabIndex={-1} ref={listRef} onKeyDown={onListKey}>
          {options.map((option, index) => (
            <li
              key={option.value}
              className={'select__option' + (index === activeIndex ? ' is-active' : '')}
              role="option"
              aria-selected={option.value === value}
              onMouseMove={() => setActiveIndex(index)}
              onClick={(event) => {
                event.preventDefault();
                commit(option.value);
              }}
            >
              <span className="select__option-label">{option.label}</span>
              <span className="select__option-check" aria-hidden="true">
                <Icon name="check" size={13} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
