/**
 * panes/TaskPane.tsx: the workspace's task list.
 *
 * The pane reads its own data rather than being handed a slice of the page's, and every write
 * it makes lands on screen before the server has answered, because a task list is edited at
 * the speed of typing.
 *
 * The five views are filtered here rather than by five requests, and that is what lets each
 * chip carry its own count: a filter that cannot say how much it holds is one the reader has
 * to click to find out. The list arrives from /tasks?view=all, which includes finished work
 * (the page counts open tasks by filtering exactly that answer), and the done view is fetched
 * beside it for a server that leaves finished work out of all.
 *
 * Grouping is by project, because a workspace's tasks are the work of its folders, and a task
 * whose folder is gone is drawn unprojected rather than dropped.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as folderApi from "../api/folders";
import * as taskApi from "../api/tasks";
import { ConfirmDialog } from "../components/dialogs";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { formatRelative } from "../lib/format";
import type { Folder, Task, TaskPriority, TaskView } from "../types";

/** The view switcher, in reading order: what is late, what is now, what is next, the rest. */
const VIEWS: { value: TaskView; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Every task still open" },
  { value: "today", label: "Today", title: "Due today, plus anything overdue" },
  { value: "upcoming", label: "Upcoming", title: "Dated tomorrow or later" },
  { value: "overdue", label: "Overdue", title: "Past its due date and still open" },
  { value: "done", label: "Done", title: "Finished, newest first" },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

/** The day boundaries the views are cut by, as ISO instants. */
interface Bounds {
  todayStart: string;
  tomorrowStart: string;
  dayAfterTomorrowStart: string;
  weekEnd: string;
}

function pad(value: number): string {
  return value < 10 ? "0" + value : String(value);
}

/** Local midnight, offset by whole days, as the instant the API stores. */
function dayStart(offset: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).toISOString();
}

function boundsOf(): Bounds {
  return {
    todayStart: dayStart(0),
    tomorrowStart: dayStart(1),
    dayAfterTomorrowStart: dayStart(2),
    weekEnd: dayStart(7),
  };
}

/** The tone a due chip wears, which follows the view it would be found under. */
function toneOf(task: Task, bounds: Bounds): "overdue" | "today" | "tomorrow" | "" {
  if (!task.due_at) return "";
  if (task.due_at < bounds.todayStart) return "overdue";
  if (task.due_at < bounds.tomorrowStart) return "today";
  if (task.due_at < bounds.dayAfterTomorrowStart) return "tomorrow";
  return "";
}

/**
 * A due date in the words a reader uses for it. The time is printed only when the task really
 * has one: an all-day task's instant is a midnight this app chose, and printing it would
 * invent a deadline nobody set.
 */
function dueLabel(task: Task, bounds: Bounds): string {
  if (!task.due_at) return "";
  const when = new Date(task.due_at);
  if (!Number.isFinite(when.getTime())) return "";
  let day: string;
  if (task.due_at < bounds.todayStart) {
    day = when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } else if (task.due_at < bounds.tomorrowStart) {
    day = "Today";
  } else if (task.due_at < bounds.dayAfterTomorrowStart) {
    day = "Tomorrow";
  } else if (task.due_at < bounds.weekEnd) {
    day = when.toLocaleDateString(undefined, { weekday: "long" });
  } else {
    day = when.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  if (task.due_has_time) {
    day += ", " + when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return day;
}

/** Whether one task belongs in one view. Finished work is only ever in Done. */
function matchesView(task: Task, view: TaskView, bounds: Bounds): boolean {
  if (view === "done") return task.done;
  if (task.done) return false;
  if (view === "all") return true;
  if (!task.due_at) return false;
  if (view === "overdue") return task.due_at < bounds.todayStart;
  if (view === "today") return task.due_at < bounds.tomorrowStart;
  return task.due_at >= bounds.tomorrowStart;
}

/** Manual order, with the id breaking a tie in one direction only. */
function byPosition(rows: Task[]): Task[] {
  return rows.slice().sort((left, right) => {
    const delta = (Number(left.position) || 0) - (Number(right.position) || 0);
    if (delta) return delta;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

/** Finished work is one order: when it was finished, newest first. */
function byFinished(rows: Task[]): Task[] {
  return rows.slice().sort((left, right) => {
    const a = left.done_at ?? "";
    const b = right.done_at ?? "";
    if (a === b) return left.id < right.id ? -1 : 1;
    return a < b ? 1 : -1;
  });
}

/** The date input value for a stamp: the local calendar day, never the UTC one. */
function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return "";
  return when.getFullYear() + "-" + pad(when.getMonth() + 1) + "-" + pad(when.getDate());
}

function timeInputValue(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return "";
  return pad(when.getHours()) + ":" + pad(when.getMinutes());
}

/**
 * The instant a date and an optional time describe.
 *
 * The parts are read as local numbers rather than through Date.parse, which would read a bare
 * yyyy-mm-dd as UTC midnight and move the task a day for anyone west of Greenwich.
 */
function dueInstant(date: string, time: string, hasTime: boolean): string | null {
  if (!date) return null;
  const parts = date.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const when = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (hasTime && /^\d{1,2}:\d{2}$/.test(time)) {
    const hm = time.split(":");
    when.setHours(Number(hm[0]), Number(hm[1]), 0, 0);
  }
  return Number.isFinite(when.getTime()) ? when.toISOString() : null;
}

function emptyBody(view: TaskView): string {
  if (view === "done") {
    return "Tasks you tick off collect here, so this view is a record of what is finished rather than a second list to tend.";
  }
  if (view === "today") {
    return "Nothing is dated today and nothing has run over. The Upcoming view has what is next.";
  }
  if (view === "upcoming") {
    return "No dated task is still ahead of you. Add one below, then give it a date from the edit dialog.";
  }
  if (view === "overdue") {
    return "Nothing has run out of time. Every task with a date is still ahead of you.";
  }
  return "Nothing is open in this workspace. Type the first task in the row below and press Enter.";
}

export function TaskPane({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [view, setView] = useState<TaskView>("all");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [titleEdit, setTitleEdit] = useState<{ id: string; value: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Set while Escape is being handled, because the blur that follows must not save. */
  const escaping = useRef(false);

  const report = useCallback(
    (error: unknown, fallback: string): void => {
      toast(error instanceof Error ? error.message : fallback, "error");
    },
    [toast],
  );

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      if (!workspaceId) return;
      try {
        const [open, done, folderRows] = await Promise.all([
          taskApi.list(workspaceId, { view: "all" }, { signal }),
          taskApi.list(workspaceId, { view: "done" }, { signal }),
          folderApi.list(workspaceId, {}, { signal }),
        ]);
        if (signal?.aborted) return;
        // Merged by id, so the two paths cannot double a row when a server answers all with
        // everything already in it.
        const merged = new Map<string, Task>();
        open.forEach((task) => merged.set(task.id, task));
        done.forEach((task) => merged.set(task.id, task));
        setTasks(Array.from(merged.values()));
        setFolders(folderRows);
      } catch (error) {
        if (signal?.aborted) return;
        report(error, "The task list could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [workspaceId, report],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const bounds = boundsOf();
  const projectNames = new Map(folders.map((folder) => [folder.id, folder.name] as const));

  /** The project a task is grouped under. A task whose folder is gone is not a project. */
  const projectOf = (task: Task): string =>
    task.folder_id !== null && projectNames.has(task.folder_id) ? task.folder_id : "";

  const counts: Record<TaskView, number> = { all: 0, today: 0, upcoming: 0, overdue: 0, done: 0 };
  tasks.forEach((task) => {
    VIEWS.forEach((option) => {
      if (matchesView(task, option.value, bounds)) counts[option.value] += 1;
    });
  });
  const openCount = tasks.filter((task) => !task.done).length;
  const overdueCount = tasks.filter(
    (task) => !task.done && task.due_at !== null && task.due_at < bounds.todayStart,
  ).length;

  const groups: { key: string; label: string; rows: Task[] }[] = [];
  const visible = tasks.filter((task) => matchesView(task, view, bounds));
  if (visible.length) {
    const buckets = new Map<string, Task[]>();
    visible.forEach((task) => {
      const key = projectOf(task);
      const list = buckets.get(key);
      if (list) list.push(task);
      else buckets.set(key, [task]);
    });
    folders.forEach((folder) => {
      const list = buckets.get(folder.id);
      if (list && list.length) {
        groups.push({ key: folder.id, label: folder.name, rows: view === "done" ? byFinished(list) : byPosition(list) });
      }
    });
    const loose = buckets.get("");
    if (loose && loose.length) {
      groups.push({ key: "", label: "No project", rows: view === "done" ? byFinished(loose) : byPosition(loose) });
    }
  }

  const apply = (updated: Task): void => {
    setTasks((current) => current.map((task) => (task.id === updated.id ? updated : task)));
  };

  const add = async (): Promise<void> => {
    const title = draft.trim();
    if (!title || !workspaceId) return;
    setDraft("");
    try {
      const created = await taskApi.create(workspaceId, { title, folder_id: null });
      setTasks((current) => [...current, created]);
    } catch (error) {
      // The half-typed task goes back into the field rather than being thrown away.
      setDraft(title);
      report(error, "That task could not be added.");
    }
  };

  const toggleDone = async (task: Task, done: boolean): Promise<void> => {
    const before = task;
    apply({ ...task, done, done_at: done ? new Date().toISOString() : null });
    try {
      apply(await taskApi.update(task.id, { done }));
    } catch (error) {
      apply(before);
      report(error, "That task could not be updated.");
    }
  };

  /** Save the title that was edited in place, or put the old one back. */
  const commitTitle = async (task: Task): Promise<void> => {
    const edit = titleEdit;
    const cancelled = escaping.current;
    escaping.current = false;
    setTitleEdit(null);
    if (cancelled || !edit || edit.id !== task.id) return;
    const title = edit.value.trim();
    if (!title || title === task.title) return;
    const before = task;
    apply({ ...task, title });
    try {
      apply(await taskApi.update(task.id, { title }));
    } catch (error) {
      apply(before);
      report(error, "The task title could not be saved.");
    }
  };

  /**
   * Drop one row onto another.
   *
   * Only rows in the same project move, because a drag is a change of order and moving a task
   * between projects is a change of meaning: that is the project field in the edit dialog.
   */
  const dropOn = (target: Task): void => {
    const sourceId = dragId;
    setDragId(null);
    if (!sourceId || sourceId === target.id) return;
    const source = tasks.find((task) => task.id === sourceId);
    if (!source || projectOf(source) !== projectOf(target)) return;
    const key = projectOf(target);
    const siblings = byPosition(tasks.filter((task) => projectOf(task) === key));
    const from = siblings.findIndex((task) => task.id === sourceId);
    const to = siblings.findIndex((task) => task.id === target.id);
    if (from === -1 || to === -1) return;
    const next = siblings.slice();
    const moved = next.splice(from, 1)[0];
    if (!moved) return;
    next.splice(to, 0, moved);
    const ranks = new Map(next.map((task, index) => [task.id, index] as const));
    setTasks((current) =>
      current.map((task) => (ranks.has(task.id) ? { ...task, position: ranks.get(task.id) ?? task.position } : task)),
    );
    void taskApi.reorder(next.map((task) => task.id)).catch((error: unknown) => {
      report(error, "The new order could not be saved.");
      void load();
    });
  };

  const rowFor = (task: Task) => {
    const tone = toneOf(task, bounds);
    const due = task.due_at ? dueLabel(task, bounds) : "";
    const editingThis = titleEdit !== null && titleEdit.id === task.id;
    return (
      <div
        key={task.id}
        className={"task-row" + (task.done ? " is-done" : "")}
        style={dragId === task.id ? { opacity: 0.55 } : undefined}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          setDragId(task.id);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          dropOn(task);
        }}
        onDragEnd={() => setDragId(null)}
      >
        <label className="checkbox checkbox--bare task-row__check">
          <input
            className="checkbox__input"
            type="checkbox"
            checked={task.done}
            aria-label={'Mark "' + task.title + '" ' + (task.done ? "not done" : "done")}
            onChange={(event) => void toggleDone(task, event.target.checked)}
          />
          <span className="checkbox__box" aria-hidden="true">
            <Icon name="check" size={12} />
          </span>
        </label>

        <div className="task-row__text">
          <input
            className="task-row__title"
            type="text"
            value={editingThis && titleEdit ? titleEdit.value : task.title}
            aria-label={"Task: " + task.title}
            autoComplete="off"
            title="Edit the title in place, or open the task for its notes, date and priority"
            onFocus={() => setTitleEdit({ id: task.id, value: task.title })}
            onChange={(event) => setTitleEdit({ id: task.id, value: event.target.value })}
            onBlur={() => void commitTitle(task)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.stopPropagation();
                escaping.current = true;
                event.currentTarget.blur();
              }
            }}
          />
          {due || (task.done && task.done_at) ? (
            <span className="task-row__meta">
              {due ? <span className={"task-chip" + (tone ? " task-chip--" + tone : "")}>{due}</span> : null}
              {task.done && task.done_at ? <span className="task-chip">{"Done " + formatRelative(task.done_at)}</span> : null}
            </span>
          ) : null}
        </div>

        {task.priority === "high" ? (
          <span className="task-row__priority" title="High priority">
            High
          </span>
        ) : null}

        <div className="task-row__actions">
          <button
            className="icon-btn icon-btn--sm task-row__action"
            type="button"
            aria-label={'Edit "' + task.title + '"'}
            title="Notes, date and priority"
            onClick={() => setEditing(task)}
          >
            <Icon name="pencil" size={13} />
          </button>
          <button
            className="icon-btn icon-btn--sm task-row__action task-row__action--danger"
            type="button"
            aria-label={'Delete "' + task.title + '"'}
            title="Delete"
            onClick={() => setPendingDelete(task)}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="pane-head">
        <h2 className="pane-head__title">Tasks</h2>
        <p className="pane-head__sub">
          {openCount + " open" + (overdueCount ? " \u00b7 " + overdueCount + " overdue" : " \u00b7 none overdue")}
        </p>
      </div>

      <div className="task-filters">
        <div className="segmented task-filters__group" role="radiogroup" aria-label="Which tasks to show">
          {VIEWS.map((option) => (
            <label className="segmented__item" key={option.value} title={option.title}>
              <input
                className="segmented__input"
                type="radio"
                name="task-view"
                value={option.value}
                checked={view === option.value}
                onChange={() => setView(option.value)}
              />
              <span className="segmented__label">{option.label}</span>
              <span className="segmented__badge">{counts[option.value]}</span>
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <EmptyState body="The task list is on its way." />
      ) : groups.length ? (
        groups.map((group) => (
          <div className="task-group" key={group.key || "none"} data-bucket={group.key || "none"}>
            <h3 className="pane-section">
              <span>{group.label}</span>
              <span className="pane-section__count">{group.rows.length}</span>
            </h3>
            {group.rows.map((task) => rowFor(task))}
          </div>
        ))
      ) : (
        <EmptyState body={emptyBody(view)} />
      )}

      <form
        className="task-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <span className="task-add__glyph" aria-hidden="true">
          <Icon name="checkCircle" size={15} />
        </span>
        <input
          id="task-add"
          className="task-add__input"
          type="text"
          value={draft}
          placeholder="Add a task..."
          aria-label="Add a task"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          className="task-add__submit"
          type="submit"
          disabled={!draft.trim()}
          title="Add this task (or press Enter)"
          aria-label="Add this task"
        >
          Add
        </button>
      </form>

      {editing ? (
        <TaskEditor
          task={editing}
          folders={folders}
          onSaved={(updated) => apply(updated)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          title="Delete this task?"
          message={'"' + pendingDelete.title + '" is removed from this workspace.'}
          consequences={[
            pendingDelete.notes ? "Its notes are deleted with it." : "It leaves the list for good.",
            "A task has no trash, so deleting it cannot be undone.",
          ]}
          confirmLabel="Delete task"
          icon="trash"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await taskApi.remove(pendingDelete.id);
            } catch (error) {
              report(error, "The task could not be deleted.");
              throw error;
            }
            setTasks((current) => current.filter((task) => task.id !== pendingDelete.id));
            setPendingDelete(null);
            toast("Task deleted.", "info");
          }}
        />
      ) : null}
    </>
  );
}

interface TaskEditorProps {
  task: Task;
  folders: Folder[];
  onSaved: (task: Task) => void;
  onClose: () => void;
}

/**
 * One task's own dialog: its notes, its project, its priority and its date, with the time
 * flag that decides whether the row prints a clock or only a day.
 *
 * A failure stays next to the form that caused it rather than in a toast the reader may never
 * connect to the action they took, which is the contract the app's other dialogs keep.
 */
function TaskEditor({ task, folders, onSaved, onClose }: TaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [folderId, setFolderId] = useState(task.folder_id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [date, setDate] = useState(dateInputValue(task.due_at));
  const [time, setTime] = useState(timeInputValue(task.due_at));
  const [allDay, setAllDay] = useState(!task.due_has_time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node && !node.open) {
      try {
        node.showModal();
      } catch {
        // Already in the top layer. The form still renders.
      }
    }
  }, []);

  const save = (): void => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("A task needs a title.");
      return;
    }
    // A time with no date is not a time at all: there is no instant for it to describe, so
    // the flag follows the date rather than the toggle.
    const hasTime = !allDay && !!date;
    setBusy(true);
    setError(null);
    taskApi
      .update(task.id, {
        title: trimmed,
        notes: notes.trim() ? notes : null,
        folder_id: folderId || null,
        due_at: dueInstant(date, time, hasTime),
        due_has_time: hasTime,
        priority,
      })
      .then((updated) => {
        onSaved(updated);
        onClose();
      })
      .catch((thrown: unknown) => {
        setError(thrown instanceof Error ? thrown.message : "That task could not be saved.");
      })
      .finally(() => setBusy(false));
  };

  return (
    <dialog
      ref={ref}
      className="dialog dialog--wide"
      aria-labelledby="task-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        className="dialog__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="dialog__head">
          <span className="dialog__icon" aria-hidden="true">
            <Icon name="checkCircle" size={16} />
          </span>
          <h2 id="task-editor-title" className="dialog__title">
            Edit task
          </h2>
          <button className="dialog__close" type="button" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="dialog__body">
          <div className="task-form">
            <div className="field">
              <label className="field__label" htmlFor="task-title">
                Task
              </label>
              <div className="field__control">
                <input
                  id="task-title"
                  className="field__input"
                  type="text"
                  value={title}
                  placeholder="What needs doing?"
                  autoComplete="off"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="task-notes">
                Notes
              </label>
              <div className="field__control">
                <textarea
                  id="task-notes"
                  className="field__input field__input--area"
                  rows={3}
                  value={notes}
                  placeholder="Notes for this task"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>

            <div className="task-form__row">
              <div className="field">
                <label className="field__label" htmlFor="task-project">
                  Project
                </label>
                <div className="field__control">
                  <select
                    id="task-project"
                    className="field__input"
                    value={folderId}
                    onChange={(event) => setFolderId(event.target.value)}
                  >
                    <option value="">No project</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="task-priority">
                  Priority
                </label>
                <div className="field__control">
                  <select
                    id="task-priority"
                    className="field__input"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  >
                    {PRIORITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="task-form__row">
              <div className="field">
                <label className="field__label" htmlFor="task-due">
                  Due date
                </label>
                <div className="field__control">
                  <input
                    id="task-due"
                    className="field__input"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="task-allday">
                  Time
                </label>
                <div className="field__control task-form__when">
                  <label className="checkbox">
                    <input
                      id="task-allday"
                      className="checkbox__input"
                      type="checkbox"
                      checked={allDay}
                      onChange={(event) => {
                        setAllDay(event.target.checked);
                        if (!event.target.checked && !time) setTime("09:00");
                      }}
                    />
                    <span className="checkbox__box" aria-hidden="true">
                      <Icon name="check" size={12} />
                    </span>
                    <span className="checkbox__label">All day</span>
                  </label>
                  <input
                    className="field__input"
                    type="time"
                    value={time}
                    aria-label="Due time"
                    disabled={allDay}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="dialog__note">
            An all-day task prints its date and no time. Give it a time and the row prints both.
          </p>

          {error ? (
            <p className="field__message field__message--error">
              <Icon name="warning" size={12} />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        <div className="dialog__footer">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
