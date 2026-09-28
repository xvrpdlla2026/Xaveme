/**
 * panes/TrashPanel.tsx: the workspace's trash, as an overlay destination.
 *
 * The trash holds three kinds of thing that share no shape, so they are flattened into one row
 * type here and grouped again for drawing: selection, filtering, restoring and purging are one
 * set of rules rather than three, which is the only way the three kinds can be trusted to
 * behave alike.
 *
 * The panel fills a fullscreen <dialog>, which is what makes Escape, the focus trap and the
 * scroll lock the browser's job instead of this file's, and it is why the surface is the panel
 * inside the frame rather than the frame itself.
 *
 * Nothing here is destroyed without a confirm, and the confirm states the counts and the
 * attachment bytes it is about to destroy: a permanent delete has no second chance, so the
 * dialog that asks for one has to be worth reading.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as attachmentApi from "../api/attachments";
import * as trashApi from "../api/trash";
import { ConfirmDialog } from "../components/dialogs";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { extensionBadge, formatBytes, formatRelative } from "../lib/format";
import type { TrashContents, TrashRow, TrashType } from "../types";

/** The filter chips, and the order the groups are drawn in. */
const KINDS: { value: TrashType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "folder", label: "Folders" },
  { value: "note", label: "Notes" },
  { value: "attachment", label: "Files" },
];

const GROUP_ORDER: { kind: TrashType; label: string }[] = [
  { kind: "folder", label: "Folders" },
  { kind: "note", label: "Notes" },
  { kind: "attachment", label: "Files" },
];

/** One deleted row, whatever it used to be. */
interface TrashEntry {
  /** "kind:id", which is what the selection set holds. */
  key: string;
  kind: TrashType;
  id: string;
  name: string;
  deleted_at: string | null;
  /** Only attachments have one: it is the byte count the confirm has to state. */
  size: number | null;
}

function labelOf(type: TrashType, row: TrashRow): string {
  const name = (row.name || "").trim();
  if (name) return name;
  if (type === "folder") return "Untitled folder";
  if (type === "note") return "Untitled note";
  return "Untitled file";
}

/** What a permanent delete actually destroys, one line each. A sentence buries it. */
function consequencesFor(entries: TrashEntry[]): string[] {
  const folders = entries.filter((entry) => entry.kind === "folder").length;
  const notes = entries.filter((entry) => entry.kind === "note").length;
  const files = entries.filter((entry) => entry.kind === "attachment");
  const bytes = files.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
  const lines: string[] = [];
  if (folders) {
    lines.push(folders === 1 ? "1 folder, and whatever is still inside it." : folders + " folders, and whatever is still inside them.");
  }
  if (notes) lines.push(notes === 1 ? "1 note and its text." : notes + " notes and their text.");
  if (files.length) {
    lines.push(
      files.length +
        " stored file" +
        (files.length === 1 ? "" : "s") +
        (bytes ? " (" + formatBytes(bytes) + " of attachment bytes)" : "") +
        ".",
    );
  }
  lines.push("These leave the trash for good: there is no copy anywhere else, and this cannot be undone.");
  return lines;
}

export function TrashPanel({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const selectAll = useRef<HTMLInputElement | null>(null);
  const [contents, setContents] = useState<TrashContents>({ folders: [], notes: [], attachments: [] });
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<TrashType | "all">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ entries: TrashEntry[]; empty: boolean } | null>(null);

  const report = useCallback(
    (error: unknown, fallback: string): void => {
      toast(error instanceof Error ? error.message : fallback, "error");
    },
    [toast],
  );

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const [rows, files] = await Promise.all([
          trashApi.list(workspaceId, { signal }),
          // The trash index carries a name and a date but no size, and a confirm about destroying
          // stored bytes has to state a number. The attachments index reports the size of the
          // trashed rows, so it is read beside the trash rather than guessed at.
          attachmentApi.list(workspaceId, { trashed: true }, { signal }),
        ]);
        if (signal?.aborted) return;
        setContents(rows);
        const map: Record<string, number> = {};
        files.forEach((file) => {
          map[file.id] = file.size;
        });
        setSizes(map);
      } catch (error) {
        if (signal?.aborted) return;
        report(error, "The trash could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [workspaceId, report],
  );

  useEffect(() => {
    const node = dialogRef.current;
    if (node && !node.open) {
      try {
        node.showModal();
      } catch {
        // Already in the top layer. The panel still renders.
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback((): void => {
    void load();
  }, [load]);

  const entries = useMemo((): TrashEntry[] => {
    const build = (type: TrashType, rows: TrashRow[]): TrashEntry[] =>
      rows.map((row) => ({
        key: type + ":" + row.id,
        kind: type,
        id: row.id,
        name: labelOf(type, row),
        deleted_at: row.deleted_at,
        size: type === "attachment" ? sizes[row.id] ?? null : null,
      }));
    return [
      ...build("folder", contents.folders),
      ...build("note", contents.notes),
      ...build("attachment", contents.attachments),
    ];
  }, [contents, sizes]);

  const counts: Record<TrashType | "all", number> = { all: entries.length, folder: 0, note: 0, attachment: 0 };
  entries.forEach((entry) => {
    counts[entry.kind] += 1;
  });

  const needle = term.trim().toLowerCase();
  const visible = entries.filter(
    (entry) => (kind === "all" || entry.kind === kind) && (!needle || entry.name.toLowerCase().includes(needle)),
  );
  const selectedEntries = entries.filter((entry) => selected[entry.key] === true);
  const visibleSelected = visible.filter((entry) => selected[entry.key] === true);
  const allVisibleSelected = visible.length > 0 && visibleSelected.length === visible.length;
  const selectedBytes = selectedEntries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
  const pendingBytes = pending ? pending.entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0) : 0;

  // The box is a real checkbox with a third state, and the third state is not a prop.
  useEffect(() => {
    const node = selectAll.current;
    if (!node) return;
    node.indeterminate = visibleSelected.length > 0 && !allVisibleSelected;
  }, [visibleSelected.length, allVisibleSelected]);

  const toggle = (key: string, on: boolean): void => {
    setSelected((current) => {
      const next = { ...current };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  };

  const toggleAll = (on: boolean): void => {
    setSelected((current) => {
      const next = { ...current };
      visible.forEach((entry) => {
        if (on) next[entry.key] = true;
        else delete next[entry.key];
      });
      return next;
    });
  };

  const restore = async (list: TrashEntry[]): Promise<void> => {
    if (!list.length || busy) return;
    setBusy(true);
    try {
      // One call per kind: restore takes a type beside the ids, and a mixed selection is the
      // ordinary case in a panel that lists all three together.
      for (const type of ["folder", "note", "attachment"] as TrashType[]) {
        const ids = list.filter((entry) => entry.kind === type).map((entry) => entry.id);
        if (ids.length) await trashApi.restore(workspaceId, { type, ids });
      }
      setSelected({});
      toast("Restored " + list.length + (list.length === 1 ? " item" : " items") + " to the workspace.", "success");
      refresh();
    } catch (error) {
      report(error, "That restore did not finish.");
    } finally {
      setBusy(false);
    }
  };

  const purge = async (list: TrashEntry[], empty: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      if (empty) {
        await trashApi.empty(workspaceId);
      } else {
        for (const entry of list) await trashApi.purge(workspaceId, entry.kind, entry.id);
      }
      setSelected({});
      setPending(null);
      toast(
        empty ? "The trash is empty." : "Permanently deleted " + list.length + (list.length === 1 ? " item." : " items."),
        "info",
      );
      refresh();
    } catch (error) {
      // Rethrown so the dialog that asked keeps the message next to the button that caused it.
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const sub = entries.length
    ? entries.length + (entries.length === 1 ? " item" : " items") + " · kept until you remove them"
    : "Nothing has been deleted";

  return (
    <dialog
      ref={dialogRef}
      className="dialog dialog--full"
      aria-labelledby="trash-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__form">
        <div className="dialog__body">
          <div className="panel">
            <header className="panel__head">
              <span className="panel__tile" aria-hidden="true">
                <Icon name="trash" />
              </span>
              <div className="panel__heading">
                <h2 id="trash-title" className="panel__title">
                  Trash
                </h2>
                <p className="panel__sub">{sub}</p>
              </div>
              <button
                className="btn btn--sm panel__close"
                type="button"
                title="Close (Esc)"
                aria-label="Close the trash and go back to the workspace"
                onClick={onClose}
              >
                <Icon name="close" size={13} />
                Close
              </button>
            </header>

            <div className="panel__tools">
              <label className="checkbox">
                <input
                  ref={selectAll}
                  className="checkbox__input"
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={!visible.length}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                <span className="checkbox__box" aria-hidden="true">
                  <Icon name="check" size={12} />
                </span>
                <span className="checkbox__label">Select all</span>
              </label>
              <span className="panel__sep" />
              <div className="segmented" role="radiogroup" aria-label="Which rows the trash shows">
                {KINDS.map((option) => (
                  <label className="segmented__item" key={option.value} title={"Show " + option.label.toLowerCase()}>
                    <input
                      className="segmented__input"
                      type="radio"
                      name="trash-view"
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                    />
                    <span className="segmented__label">{option.label}</span>
                    <span className="segmented__badge">{counts[option.value]}</span>
                  </label>
                ))}
              </div>
              <span className="panel__spacer" />
              <div className="search-field">
                <Icon name="search" size={14} />
                <input
                  type="search"
                  value={term}
                  placeholder="Filter by name"
                  aria-label="Filter trash by name"
                  autoComplete="off"
                  onChange={(event) => setTerm(event.target.value)}
                />
              </div>
            </div>

            <div className="panel__list">
              {loading ? (
                <div className="trash-empty">
                  <span className="trash-empty__mark" aria-hidden="true">
                    <Icon name="emptyTrash" size={20} />
                  </span>
                  <h3>Loading the trash</h3>
                  <p>Deleted folders, notes and files are on their way.</p>
                </div>
              ) : visible.length ? (
                GROUP_ORDER.map((group) => {
                  const rows = visible.filter((entry) => entry.kind === group.kind);
                  if (!rows.length) return null;
                  return (
                    <div key={group.kind}>
                      <h3 className="panel__group">
                        <span>{group.label}</span>
                        <span className="panel__group-count">{rows.length}</span>
                      </h3>
                      {rows.map((entry) => {
                        const isSelected = selected[entry.key] === true;
                        return (
                          <div className={"trash-row" + (isSelected ? " is-selected" : "")} key={entry.key}>
                            <label className="checkbox checkbox--bare">
                              <input
                                className="checkbox__input"
                                type="checkbox"
                                checked={isSelected}
                                aria-label={"Select " + entry.name}
                                onChange={(event) => toggle(entry.key, event.target.checked)}
                              />
                              <span className="checkbox__box" aria-hidden="true">
                                <Icon name="check" size={12} />
                              </span>
                            </label>
                            <span
                              className={"trash-row__glyph" + (entry.kind === "attachment" ? " trash-row__glyph--file" : "")}
                            >
                              {entry.kind === "attachment" ? (
                                extensionBadge(entry.name)
                              ) : (
                                <Icon name={entry.kind === "folder" ? "folder" : "note"} size={14} />
                              )}
                            </span>
                            <span className="trash-row__text">
                              <span className="trash-row__name" title={entry.name}>
                                {entry.name}
                              </span>
                              <span className="trash-row__meta">
                                <span>{entry.deleted_at ? "deleted " + formatRelative(entry.deleted_at) : "in the trash"}</span>
                                {entry.size !== null ? <span>{formatBytes(entry.size)}</span> : null}
                              </span>
                            </span>
                            <span className="trash-row__actions">
                              <button
                                className="btn btn--sm btn--ghost"
                                type="button"
                                title={"Restore " + entry.name}
                                disabled={busy}
                                onClick={() => void restore([entry])}
                              >
                                <Icon name="restore" size={13} />
                                Restore
                              </button>
                              <button
                                className="btn btn--sm btn--icon-danger"
                                type="button"
                                aria-label={"Delete " + entry.name + " permanently"}
                                title="Delete permanently"
                                onClick={() => setPending({ entries: [entry], empty: false })}
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                <div className="trash-empty">
                  <span className="trash-empty__mark" aria-hidden="true">
                    <Icon name="emptyTrash" size={20} />
                  </span>
                  <h3>{entries.length ? "No matches" : "Trash is empty"}</h3>
                  <p>
                    {entries.length
                      ? "No deleted item in this view matches the filter. Clear it to see everything the trash holds."
                      : "Deleted folders, notes and files wait here until you restore them or remove them for good."}
                  </p>
                </div>
              )}
            </div>

            <div className="panel__foot">
              {selectedEntries.length ? (
                <>
                  <p className="panel__count panel__count--has">
                    <strong>{selectedEntries.length}</strong>
                    {selectedEntries.length === 1 ? " item selected" : " items selected"}
                    {selectedBytes ? " · " + formatBytes(selectedBytes) + " of stored attachment bytes" : ""}
                    {" · restoring a note or file whose folder is also deleted brings the folder back with it."}
                  </p>
                  <button
                    className="btn btn--sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setSelected({})}
                  >
                    <Icon name="close" size={12} />
                    Clear
                  </button>
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void restore(selectedEntries)}
                  >
                    <Icon name="restore" size={13} />
                    Restore
                  </button>
                  <button
                    className="btn btn--danger"
                    type="button"
                    disabled={busy}
                    onClick={() => setPending({ entries: selectedEntries, empty: false })}
                  >
                    <Icon name="trash" size={13} />
                    Delete permanently...
                  </button>
                </>
              ) : (
                <>
                  <p className="panel__count">
                    {entries.length
                      ? "Select items to restore or remove them. A folder takes whatever is still inside it."
                      : "Nothing to act on."}
                  </p>
                  {entries.length ? (
                    <button
                      className="btn btn--danger-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => setPending({ entries, empty: true })}
                    >
                      <Icon name="trash" size={13} />
                      Empty the trash
                    </button>
                  ) : null}
                  <button className="btn btn--primary" type="button" onClick={onClose}>
                    Back to workspace
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {pending ? (
        <ConfirmDialog
          open
          danger
          icon="warning"
          title={
            pending.empty
              ? "Empty the trash?"
              : pending.entries.length === 1
                ? "Delete this permanently?"
                : "Delete " + pending.entries.length + " items permanently?"
          }
          message={
            pending.empty
              ? "Every deleted folder, note and file in this workspace is destroyed for good, including " +
                formatBytes(pendingBytes) +
                " of stored attachment bytes."
              : "This leaves the trash for good. Nothing here can be restored afterwards."
          }
          consequences={consequencesFor(pending.entries)}
          confirmLabel={pending.empty ? "Empty the trash" : "Delete permanently"}
          cancelLabel="Keep in trash"
          onCancel={() => setPending(null)}
          onConfirm={() => purge(pending.entries, pending.empty)}
        />
      ) : null}
    </dialog>
  );
}
