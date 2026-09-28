/*!
 * pages/Workspace.tsx: the shell, and the state every pane is drawn from.
 *
 * The layout is the reference app's: a top bar, a rail, a main pane and a trash control in
 * the workspace area's corner. Under 820px the is-mobile-list class on the layout decides
 * which single pane is on screen, and the class is only ever set while that media query
 * matches, so widening the window cannot leave a stale pane decision behind.
 *
 * This file owns the data the tree and the editor read, and it owns the optimistic reorder
 * that the sort control needs, and the drag-to-move that the tree starts. Everything here
 * that can fail reports through the toast queue: a write that failed silently is a write the
 * reader believes happened.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, JSX } from "react";
import * as attachmentApi from "../api/attachments";
import * as folderApi from "../api/folders";
import * as noteApi from "../api/notes";
import { request } from "../api/client";
import {
  isEnvelope,
  markVaultUnknown,
  openText,
  sealText,
  setVault as setVaultRow,
  status as vaultStatus,
  unlockVault,
} from "../lib/crypto";
import type { VaultStatus } from "../lib/crypto";
import type {
  Attachment,
  Folder,
  Note,
  Sort,
  Workspace as WorkspaceModel,
  WorkspaceStats,
} from "../types";
import Editor from "../components/Editor";
import type { EditorSave } from "../components/Editor";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import Sidebar from "../components/Sidebar";
import type { ContextItem, Selection, TreeActions } from "../components/Tree";
import Topbar from "../components/Topbar";
import type { WorkspaceView } from "../components/Topbar";
import { ConfirmDialog, ContextMenu, PromptDialog } from "../components/dialogs";
import { AttachmentsPanel } from "../panes/AttachmentsPanel";
import { Dropzone } from "../panes/Dropzone";
import { SettingsDialog } from "../panes/SettingsDialog";
import { TaskPane } from "../panes/TaskPane";
import { TrashPanel } from "../panes/TrashPanel";
import { VaultGate } from "../panes/VaultGate";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

/** The breakpoint the stylesheet uses for the single-pane layout. */
const NARROW_QUERY = "(max-width: 820px)";

const LAST_WORKSPACE_KEY = "notebook.lastWorkspaceId";

/** The shape of the trash index, reduced to what the corner badge counts. */
interface TrashContents {
  folders: unknown[];
  notes: unknown[];
  attachments: unknown[];
}

function countTrash(contents: TrashContents): number {
  return contents.folders.length + contents.notes.length + contents.attachments.length;
}

function readLastWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function writeLastWorkspace(id: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, id);
  } catch {
    // A disabled store is not a reason to refuse the switch.
  }
}

/** The folder a note sits in, or null for the workspace root. */
function folderOfNote(notes: Note[], id: string): string | null {
  const note = notes.find((entry) => entry.id === id);
  return note ? note.folder_id ?? null : null;
}

/** Every folder below this one. A folder cannot be moved inside its own subtree. */
function collectDescendants(folders: Folder[], rootId: string): Set<string> {
  const found = new Set<string>();
  const walk = (parentId: string): void => {
    folders.forEach((folder) => {
      if ((folder.parent_id ?? null) === parentId && !found.has(folder.id)) {
        found.add(folder.id);
        walk(folder.id);
      }
    });
  };
  walk(rootId);
  return found;
}

export default function Workspace(): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();

  const [workspaces, setWorkspaces] = useState<WorkspaceModel[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "manual", direction: "asc" });
  const [view, setView] = useState<WorkspaceView>("notes");
  const [narrow, setNarrow] = useState<boolean>(() => window.matchMedia(NARROW_QUERY).matches);
  const [mobileList, setMobileList] = useState(true);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<Selection>({ type: "all", id: null });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);

  /**
   * The plaintext of the open note, keyed by the note it belongs to. A sealed body is opened
   * once, here, and only plaintext is ever handed to the editor.
   */
  const [openedBody, setOpenedBody] = useState<{ id: string; content: string } | null>(null);
  const [openingBody, setOpeningBody] = useState(false);

  const [trashOpen, setTrashOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);

  // What the panes draw the vault as. This default is only a paint: every write decides from
  // the crypto module's own status, which is unknown until the vault row has been read.
  const [vault, setVault] = useState<VaultStatus>("off");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaBytes, setQuotaBytes] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [menu, setMenu] = useState<{ x: number; y: number; title: string; items: ContextItem[] } | null>(null);
  const [prompt, setPrompt] = useState<{
    title: string;
    label: string;
    value: string;
    confirmLabel: string;
    required: boolean;
    onSubmit: (value: string) => Promise<void>;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    consequences?: string[];
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const uploadFolder = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const activeNoteIdRef = useRef<string | null>(null);
  activeNoteIdRef.current = activeNoteId;
  const activeAttachmentRef = useRef<Attachment | null>(null);
  activeAttachmentRef.current = activeAttachment;

  const report = useCallback(
    (error: unknown, fallback: string): void => {
      toast(error instanceof Error ? error.message : fallback, "error");
    },
    [toast],
  );

  // ------------------------------------------------------------------- workspaces

  useEffect(() => {
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      try {
        const list = await request<WorkspaceModel[]>({
          method: "get",
          path: "/workspaces",
          signal: controller.signal,
        });
        setWorkspaces(list);
        const stored = readLastWorkspace();
        const first = list[0];
        if (stored && list.some((workspace) => workspace.id === stored)) setWorkspaceId(stored);
        else if (first) setWorkspaceId(first.id);
        else {
          // A user with no workspace would have nowhere to write. One is made for them.
          const created = await request<WorkspaceModel>({
            method: "post",
            path: "/workspaces",
            body: { name: "Personal" },
            signal: controller.signal,
          });
          setWorkspaces([created]);
          setWorkspaceId(created.id);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        report(error, "Your workspaces could not be loaded.");
      }
    };
    void load();
    return () => controller.abort();
  }, [report]);

  useEffect(() => {
    if (workspaceId) writeLastWorkspace(workspaceId);
  }, [workspaceId]);

  // -------------------------------------------------------------------- contents

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);

    const load = async (): Promise<void> => {
      try {
        const [folderRows, noteRows, attachmentRows, statsRow, trashRows] = await Promise.all([
          folderApi.list(workspaceId, {}, { signal }),
          noteApi.list(
            workspaceId,
            {
              sort: sort.key,
              direction: sort.direction,
              ...(search.trim() ? { q: search.trim() } : {}),
            },
            { signal },
          ),
          attachmentApi.list(workspaceId, {}, { signal }),
          request<WorkspaceStats>({
            method: "get",
            path: "/workspaces/" + workspaceId + "/stats",
            signal,
          }),
          request<TrashContents>({
            method: "get",
            path: "/workspaces/" + workspaceId + "/trash",
            signal,
          }),
        ]);
        if (signal.aborted) return;
        setFolders(folderRows);
        setNotes(noteRows);
        setAttachments(attachmentRows);
        setStats(statsRow);
        setTrashCount(countTrash(trashRows));
      } catch (error) {
        if (signal.aborted) return;
        report(error, "This workspace could not be loaded.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [workspaceId, sort.key, sort.direction, search, reloadKey, report]);

  // The vault row decides whether note bodies are sealed. Without it the editor would seal
  // a body into a notebook that has no key, which is the one thing the format forbids.
  useEffect(() => {
    let cancelled = false;
    request<{ salt: string; iterations: number; check_iv: string; check_ct: string; configured: boolean }>({
      method: "get",
      path: "/vault",
    })
      .then((row) => {
        if (cancelled) return;
        setVaultRow(row);
        setVault(vaultStatus());
      })
      .catch((error: unknown) => {
        // A read that failed says nothing about whether a vault exists, so the state becomes
        // unknown and every write refuses until it can be read. Assuming "no vault" here is what
        // let a sealed notebook be autosaved as plain text, silently.
        if (cancelled) return;
        markVaultUnknown();
        setVault(vaultStatus());
        report(error, "The vault could not be read, so nothing will be written until it can be.");
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  // The storage meter needs the browser's own quota, which is the one number the server
  // cannot know.
  useEffect(() => {
    let cancelled = false;
    if (navigator.storage && typeof navigator.storage.estimate === "function") {
      navigator.storage
        .estimate()
        .then((estimate) => {
          if (!cancelled && typeof estimate.quota === "number") setQuotaBytes(estimate.quota);
        })
        .catch(() => {
          // No estimate: the readout simply omits the meter.
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback((): void => {
    setReloadKey((key) => key + 1);
  }, []);

  // The top bar's task button counts what is still open. It is read here rather than in the
  // pane, because the badge has to be right while the pane is closed.
  useEffect(() => {
    if (!workspaceId) {
      setOpenTasks(0);
      return;
    }
    const controller = new AbortController();
    request<{ done: boolean }[]>({
      method: "get",
      path: "/workspaces/" + workspaceId + "/tasks",
      params: { view: "all" },
      signal: controller.signal,
    })
      .then((rows) => {
        if (!controller.signal.aborted) setOpenTasks(rows.filter((task) => !task.done).length);
      })
      .catch(() => {
        // A task count that could not be read leaves the badge off rather than wrong.
      });
    return () => controller.abort();
  }, [workspaceId, reloadKey]);

  const patchNoteLocal = useCallback((updated: Note): void => {
    setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
  }, []);

  // ----------------------------------------------------------------- optimistic order

  /**
   * Move one item inside its own sibling list.
   *
   * apply() changes the list on screen before anything is sent, which is what makes a reorder
   * feel immediate; the re-read that follows either confirms the new order or puts the old one
   * back when the write failed. A row that would not move is never sent at all, so the server
   * is not asked to agree with a no-op.
   */
  const reorderOptimistically = useCallback(
    async <T extends { id: string }>(
      list: T[],
      id: string,
      delta: number,
      apply: (next: T[]) => void,
      send: (ids: string[]) => Promise<void>,
    ): Promise<void> => {
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) return;
      const target = index + delta;
      if (target < 0 || target >= list.length) return;
      const next = list.slice();
      const moved = next.splice(index, 1)[0];
      if (!moved) return;
      next.splice(target, 0, moved);
      apply(next);
      try {
        await send(next.map((item) => item.id));
      } catch (error) {
        report(error, "The new order could not be saved, so the previous one was restored.");
      } finally {
        refresh();
      }
    },
    [refresh, report],
  );

  /** Renumber a sibling list from its new drawing order. */
  const withRanks = useCallback(
    <T extends { id: string; position: number }>(rows: T[], next: T[]): T[] => {
      const ranks = new Map(next.map((entry, index) => [entry.id, index]));
      return rows.map((entry) =>
        ranks.has(entry.id) ? { ...entry, position: ranks.get(entry.id) ?? entry.position } : entry,
      );
    },
    [],
  );

  const moveWithin = useCallback(
    (kind: "folder" | "note" | "attachment", id: string, delta: number): void => {
      if (kind === "folder") {
        const folder = folders.find((entry) => entry.id === id);
        if (!folder) return;
        const parent = folder.parent_id ?? null;
        const siblings = folders.filter((entry) => (entry.parent_id ?? null) === parent);
        void reorderOptimistically(
          siblings,
          id,
          delta,
          (next) => setFolders((current) => withRanks(current, next)),
          (ids) => folderApi.reorder(ids),
        );
        return;
      }
      if (kind === "note") {
        const scope = folderOfNote(notes, id);
        const siblings = notes.filter((entry) => (entry.folder_id ?? null) === scope);
        void reorderOptimistically(
          siblings,
          id,
          delta,
          (next) => setNotes((current) => withRanks(current, next)),
          (ids) => noteApi.reorder(ids, scope),
        );
        return;
      }
      const attachment = attachments.find((entry) => entry.id === id);
      if (!attachment) return;
      const scope = attachment.folder_id ?? null;
      const siblings = attachments.filter((entry) => (entry.folder_id ?? null) === scope);
      void reorderOptimistically(
        siblings,
        id,
        delta,
        (next) => setAttachments((current) => withRanks(current, next)),
        (ids) => attachmentApi.reorder(ids, scope),
      );
    },
    [attachments, folders, notes, reorderOptimistically, withRanks],
  );

  // ------------------------------------------------------------------- moving rows

  const moveNote = useCallback(
    async (id: string, folderId: string | null): Promise<void> => {
      const note = notes.find((entry) => entry.id === id);
      if (!note || (note.folder_id ?? null) === folderId) return;
      const before = note;
      setNotes((current) => current.map((entry) => (entry.id === id ? { ...entry, folder_id: folderId } : entry)));
      try {
        await noteApi.update(id, { folder_id: folderId });
      } catch (error) {
        setNotes((current) => current.map((entry) => (entry.id === id ? before : entry)));
        report(error, "The note could not be moved.");
      } finally {
        refresh();
      }
    },
    [notes, refresh, report],
  );

  const moveAttachment = useCallback(
    async (id: string, folderId: string | null): Promise<void> => {
      const attachment = attachments.find((entry) => entry.id === id);
      if (!attachment || (attachment.folder_id ?? null) === folderId) return;
      const before = attachment;
      setAttachments((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, folder_id: folderId } : entry)),
      );
      try {
        await attachmentApi.update(id, { folder_id: folderId });
      } catch (error) {
        setAttachments((current) => current.map((entry) => (entry.id === id ? before : entry)));
        report(error, "The file could not be moved.");
      } finally {
        refresh();
      }
    },
    [attachments, refresh, report],
  );

  const moveFolderTo = useCallback(
    async (id: string, parentId: string | null): Promise<void> => {
      const folder = folders.find((entry) => entry.id === id);
      if (!folder || (folder.parent_id ?? null) === parentId) return;
      const before = folder;
      setFolders((current) => current.map((entry) => (entry.id === id ? { ...entry, parent_id: parentId } : entry)));
      if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
      try {
        await folderApi.update(id, { parent_id: parentId });
      } catch (error) {
        setFolders((current) => current.map((entry) => (entry.id === id ? before : entry)));
        report(error, "The folder could not be moved.");
      } finally {
        refresh();
      }
    },
    [folders, refresh, report],
  );

  // --------------------------------------------------------------------- mutations

  const newNote = useCallback(
    async (folderId: string | null): Promise<void> => {
      if (!workspaceId) return;
      try {
        const created = await noteApi.create(workspaceId, { title: "", content: "", folder_id: folderId });
        setNotes((current) => [...current, created]);
        if (folderId) setExpanded((current) => ({ ...current, [folderId]: true }));
        setActiveNoteId(created.id);
        setActiveAttachment(null);
        setView("notes");
        setMobileList(false);
      } catch (error) {
        report(error, "A new note could not be created.");
      }
    },
    [report, workspaceId],
  );

  const newFolder = useCallback(
    async (parentId: string | null, name: string): Promise<void> => {
      if (!workspaceId) return;
      try {
        const created = await folderApi.create(workspaceId, { name, parent_id: parentId });
        setFolders((current) => [...current, created]);
        if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
        setSelection({ type: "folder", id: created.id });
      } catch (error) {
        report(error, "The folder could not be created.");
        throw error;
      }
    },
    [report, workspaceId],
  );

  const askNewFolder = useCallback(
    (parentId: string | null): void => {
      setPrompt({
        title: parentId ? "New subfolder" : "New folder",
        label: "Folder name",
        value: "",
        confirmLabel: "Create folder",
        required: true,
        onSubmit: (value) => newFolder(parentId, value),
      });
    },
    [newFolder],
  );

  const renameFolder = useCallback(
    (id: string): void => {
      const folder = folders.find((entry) => entry.id === id);
      if (!folder) return;
      setPrompt({
        title: "Rename folder",
        label: "Folder name",
        value: folder.name,
        confirmLabel: "Rename",
        required: true,
        onSubmit: async (value) => {
          try {
            const updated = await folderApi.update(id, { name: value });
            setFolders((current) => current.map((entry) => (entry.id === id ? updated : entry)));
          } catch (error) {
            report(error, "The folder could not be renamed.");
            throw error;
          }
        },
      });
    },
    [folders, report],
  );

  const deleteFolder = useCallback(
    (id: string): void => {
      const folder = folders.find((entry) => entry.id === id);
      if (!folder) return;
      const name = folder.name;
      setConfirm({
        title: "Delete this folder?",
        message: '"' + name + '" goes to the trash, with everything inside it.',
        consequences: ["Its subfolders, notes and files go too.", "It can be restored from the trash."],
        confirmLabel: "Delete folder",
        onConfirm: async () => {
          try {
            await folderApi.remove(id);
            setConfirm(null);
            setNotes((current) => current.filter((note) => note.folder_id !== id));
            setSelection((current) => (current.type === "folder" && current.id === id ? { type: "all", id: null } : current));
            refresh();
            toast("Folder moved to the trash.", "success");
          } catch (error) {
            report(error, "The folder could not be deleted.");
            throw error;
          }
        },
      });
    },
    [folders, refresh, report, toast],
  );

  const renameNote = useCallback(
    (id: string): void => {
      const note = notes.find((entry) => entry.id === id);
      if (!note) return;
      setPrompt({
        title: "Rename note",
        label: "Note title",
        value: note.title,
        confirmLabel: "Rename",
        required: false,
        onSubmit: async (value) => {
          try {
            const updated = await noteApi.update(id, { title: value });
            patchNoteLocal(updated);
          } catch (error) {
            report(error, "The note could not be renamed.");
            throw error;
          }
        },
      });
    },
    [notes, patchNoteLocal, report],
  );

  const deleteNote = useCallback(
    (id: string): void => {
      const note = notes.find((entry) => entry.id === id);
      if (!note) return;
      const title = note.title.trim() || "Untitled note";
      setConfirm({
        title: "Move this note to the trash?",
        message: '"' + title + '" can be restored from the trash until it is purged.',
        confirmLabel: "Move to trash",
        onConfirm: async () => {
          try {
            await noteApi.remove(id);
            setConfirm(null);
            if (activeNoteIdRef.current === id) setActiveNoteId(null);
            setNotes((current) => current.filter((entry) => entry.id !== id));
            refresh();
            toast("Note moved to the trash.", "success");
          } catch (error) {
            report(error, "The note could not be deleted.");
            throw error;
          }
        },
      });
    },
    [notes, refresh, report, toast],
  );

  const renameAttachment = useCallback(
    (id: string): void => {
      const attachment = attachments.find((entry) => entry.id === id);
      if (!attachment) return;
      setPrompt({
        title: "Rename file",
        label: "File name",
        value: attachment.filename,
        confirmLabel: "Rename",
        required: true,
        onSubmit: async (value) => {
          try {
            const updated = await attachmentApi.update(id, { filename: value });
            setAttachments((current) => current.map((entry) => (entry.id === id ? updated : entry)));
            setActiveAttachment((current) => (current && current.id === id ? updated : current));
          } catch (error) {
            report(error, "The file could not be renamed.");
            throw error;
          }
        },
      });
    },
    [attachments, report],
  );

  const deleteAttachment = useCallback(
    (id: string): void => {
      const attachment = attachments.find((entry) => entry.id === id);
      if (!attachment) return;
      const filename = attachment.filename;
      setConfirm({
        title: "Move this file to the trash?",
        message: '"' + filename + '" can be restored from the trash until it is purged.',
        confirmLabel: "Move to trash",
        onConfirm: async () => {
          try {
            await attachmentApi.remove(id);
            setConfirm(null);
            setAttachments((current) => current.filter((entry) => entry.id !== id));
            setActiveAttachment((current) => (current && current.id === id ? null : current));
            refresh();
            toast("File moved to the trash.", "success");
          } catch (error) {
            report(error, "The file could not be deleted.");
            throw error;
          }
        },
      });
    },
    [attachments, refresh, report, toast],
  );

  // ----------------------------------------------------------------------- uploads

  const uploadFiles = useCallback(
    async (files: FileList | File[], folderId: string | null): Promise<void> => {
      if (!workspaceId) return;
      const list = Array.from(files);
      if (!list.length) return;
      let done = 0;
      for (const file of list) {
        setUploadStatus("Uploading " + file.name + " (" + String(done + 1) + " of " + String(list.length) + ")");
        try {
          // The bytes go up as they are: the vault seals note bodies only, never files, so the
          // flag says false rather than claiming a seal that does not happen.
          await attachmentApi.upload(workspaceId, { file, folder_id: folderId, encrypted: false });
          done += 1;
        } catch (error) {
          report(error, "The upload of " + file.name + " failed.");
          break;
        }
      }
      if (done) {
        setUploadStatus(done + " file" + (done === 1 ? "" : "s") + " uploaded.");
        refresh();
        window.setTimeout(() => setUploadStatus(null), 4000);
      } else {
        setUploadStatus(null);
      }
    },
    [refresh, report, workspaceId],
  );

  // ----------------------------------------------------------------- drag and drop

  const onDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    let hasFiles = false;
    const types = event.dataTransfer.types;
    for (let i = 0; i < types.length; i += 1) {
      if (types[i] === "Files") hasFiles = true;
    }
    if (!hasFiles) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDropActive(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropActive(false);
  }, []);

  /** Where a new note or an upload lands: the open folder, else the open note's folder. */
  const targetFolder = useCallback((): string | null => {
    if (selection.type === "folder") return selection.id;
    if (activeAttachment) return activeAttachment.folder_id;
    if (activeNoteId) return folderOfNote(notes, activeNoteId);
    return null;
  }, [activeAttachment, activeNoteId, notes, selection]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDropActive(false);
      const files = event.dataTransfer.files;
      if (files && files.length) void uploadFiles(files, targetFolder());
    },
    [targetFolder, uploadFiles],
  );

  /** The open note, or null when the reader is looking at something else. */
  const activeNote = useMemo(() => notes.find((note) => note.id === activeNoteId) ?? null, [activeNoteId, notes]);

  // ------------------------------------------------------------ the body the editor draws

  /**
   * The open note's body, opened.
   *
   * A stored body is either plaintext or an envelope, and the editor may only ever be handed
   * the first: an envelope is not the note, it is the note in a sealed form. So an envelope is
   * opened with the vault key here, and until that has happened the editor is not mounted at
   * all. That is what keeps the raw envelope off the screen and out of the next autosave, which
   * would otherwise seal it a second time and destroy the text inside it.
   */
  const activeBody = activeNote ? activeNote.content : null;
  const activeBodyId = activeNote ? activeNote.id : null;
  useEffect(() => {
    if (!activeBody || !activeBodyId || !isEnvelope(activeBody) || vault !== "unlocked") {
      setOpeningBody(false);
      return;
    }
    let cancelled = false;
    setOpeningBody(true);
    openText(activeBody)
      .then((plain) => {
        if (!cancelled) setOpenedBody({ id: activeBodyId, content: plain });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOpenedBody(null);
        report(error, "This note could not be opened, so it is not shown and will not be written over.");
      })
      .finally(() => {
        if (!cancelled) setOpeningBody(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBody, activeBodyId, vault, report]);

  /**
   * What the editor is mounted with, or null while there is nothing safe to mount it with.
   *
   * The plaintext is held against the note's id rather than against the stored body it came
   * from, because a save answers with the envelope that was just written: matching on the body
   * would unmount the editor and lose the cursor on every autosave, and the text is the same
   * text. What the editor is given here is plaintext, always.
   */
  const editorNote = useMemo((): Note | null => {
    if (!activeNote) return null;
    if (!isEnvelope(activeNote.content)) return activeNote;
    if (openedBody && openedBody.id === activeNote.id) return { ...activeNote, content: openedBody.content };
    return null;
  }, [activeNote, openedBody]);

  /**
   * What the sort menu's Move up and Move down act on.
   *
   * The row a command moves is the one the reader is looking at: the open note or file, or
   * the selected folder. Reordering is offered only in manual order, because a list sorted by
   * name would spring back the moment it was redrawn.
   */
  const reorderTarget = useMemo((): { id: string; kind: "folder" | "note" | "attachment"; label: string } | null => {
    if (activeNote) return { id: activeNote.id, kind: "note", label: activeNote.title.trim() || "Untitled note" };
    if (activeAttachment) return { id: activeAttachment.id, kind: "attachment", label: activeAttachment.filename };
    if (selection.type === "folder" && selection.id) {
      const folder = folders.find((entry) => entry.id === selection.id);
      if (folder) return { id: folder.id, kind: "folder", label: folder.name };
    }
    return null;
  }, [activeAttachment, activeNote, folders, selection]);

  const movePosition = useCallback(
    (delta: number): void => {
      if (!reorderTarget || sort.key !== "manual") return;
      moveWithin(reorderTarget.kind, reorderTarget.id, delta);
    },
    [moveWithin, reorderTarget, sort.key],
  );

  // ---------------------------------------------------------------------- editor

  const onSave: EditorSave = useCallback(
    async (draft, mode) => {
      // The id is the editor's own, taken from the draft. Reading it back out of the page would
      // write the draft into whichever note is open by the time the write runs, which is how the
      // pending save of a note the reader just left landed in the note they just opened.
      const id = draft.id;
      if (!id) return;
      // The editor only ever holds plaintext, so an envelope here means the open path did not
      // run for this body. Writing it would seal a sealed value or store ciphertext where text
      // is expected, and the server keeps no copy of what was inside it, so the save is refused
      // and the reader is told rather than being handed a note that quietly lost its text.
      if (isEnvelope(draft.content)) {
        const message =
          "This note's body is still sealed text, so saving it would destroy it. Nothing was saved. Reopen the note from the tree.";
        toast(message, "error");
        throw new Error(message);
      }
      const sealing = vaultStatus() !== "off";
      let content: string;
      try {
        content = sealing ? await sealText(draft.content) : draft.content;
      } catch (error) {
        // A refusal is a real save failure: the editor is told, and so is the reader, who may
        // not be looking at the status line when it happens.
        toast(error instanceof Error ? error.message : "This note was not saved.", "error");
        throw error;
      }
      const payload: { title: string; content: string; encrypted?: boolean } = {
        title: draft.title,
        content,
      };
      if (sealing) payload.encrypted = true;
      const updated = await noteApi.update(id, payload);
      patchNoteLocal(updated);
      if (mode === "manual") toast("Note saved.", "success");
    },
    [patchNoteLocal, toast],
  );

  // --------------------------------------------------------------------- tree wiring

  const treeActions: TreeActions = useMemo(
    () => ({
      onSelect: (next) => {
        setSelection(next);
        setView("notes");
      },
      onToggleFolder: (id) => {
        setExpanded((current) => ({ ...current, [id]: !current[id] }));
      },
      onOpenNote: (id) => {
        setActiveNoteId(id);
        setActiveAttachment(null);
        setView("notes");
        setMobileList(false);
      },
      onOpenAttachment: (id) => {
        const attachment = attachments.find((entry) => entry.id === id);
        if (!attachment) return;
        setActiveAttachment(attachment);
        setView("notes");
        setMobileList(false);
      },
      onNewNote: (folderId) => {
        void newNote(folderId);
      },
      onNewFolder: (parentId) => {
        askNewFolder(parentId);
      },
      onRenameFolder: (id) => {
        renameFolder(id);
      },
      onReparentFolder: (id) => {
        const moving = folders.find((entry) => entry.id === id);
        if (!moving) return;
        const blocked = collectDescendants(folders, id);
        const items: ContextItem[] = [
          { id: "root", label: "Move to the workspace root", onSelect: () => void moveFolderTo(id, null) },
          ...folders
            .filter((entry) => entry.id !== id && !blocked.has(entry.id))
            .map((entry) => ({
              id: entry.id,
              label: 'Into "' + entry.name + '"',
              onSelect: () => void moveFolderTo(id, entry.id),
            })),
        ];
        setMenu({ x: 48, y: 160, title: 'Move "' + moving.name + '"', items });
      },
      onDeleteFolder: (id) => {
        deleteFolder(id);
      },
      onRenameNote: (id) => {
        renameNote(id);
      },
      onDeleteNote: (id) => {
        deleteNote(id);
      },
      onRenameAttachment: (id) => {
        renameAttachment(id);
      },
      onDeleteAttachment: (id) => {
        deleteAttachment(id);
      },
      onMoveNote: (id, folderId) => {
        void moveNote(id, folderId);
      },
      onMoveAttachment: (id, folderId) => {
        void moveAttachment(id, folderId);
      },
      onMoveFolder: (id, parentId) => {
        void moveFolderTo(id, parentId);
      },
      onContextMenu: (x, y, title, items) => {
        setMenu({ x, y, title, items });
      },
    }),
    [
      askNewFolder,
      attachments,
      deleteAttachment,
      deleteFolder,
      deleteNote,
      folders,
      moveAttachment,
      moveFolderTo,
      moveNote,
      newNote,
      renameAttachment,
      renameFolder,
      renameNote,
    ],
  );

  // -------------------------------------------------------------- escape and layout

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (menu) {
        setMenu(null);
        return;
      }
      // A dialog owns its own Escape: the browser's cancel event goes to it first.
      if (trashOpen || settingsOpen || prompt || confirm) return;
      if (search) {
        setSearch("");
        return;
      }
      if (activeNoteId) setActiveNoteId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeNoteId, confirm, menu, prompt, search, settingsOpen, trashOpen]);

  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const sync = (matches: boolean): void => {
      setNarrow(matches);
      // Crossing the breakpoint re-derives the pane: the list, unless something is open.
      setMobileList(!(activeNoteIdRef.current !== null || activeAttachmentRef.current !== null));
    };
    const onChange = (event: MediaQueryListEvent): void => sync(event.matches);
    sync(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // --------------------------------------------------------------------- painting

  const workspace = workspaces.find((entry) => entry.id === workspaceId) ?? null;
  const searching = search.trim().length > 0;
  const locked = vault === "locked";
  // With nothing open the page draws an empty state of its own, and the attachments pane draws
  // one as well. The two landed stacked on a workspace that holds nothing, both offering Upload
  // file and both explaining the same drop target. They are now exclusive: this page's card is
  // the one for a workspace with nothing in it at all, and the pane's is the one for everything
  // else, which is also the only card that can name the folder it is talking about.
  const workspaceEmpty = notes.length === 0 && folders.length === 0 && attachments.length === 0;

  const onPickFile = (): void => {
    uploadFolder.current = targetFolder();
    fileInput.current?.click();
  };

  // The topbar is a sibling of the grid, not a cell in it. The stylesheet gives .layout two
  // columns, and a child that sets no grid-column is auto-placed into the first one, which is
  // the rail: a topbar inside .layout took the rail's width and squeezed the editor into it.
  return (
    <>
      <Topbar
        search={search}
        onSearch={(value) => {
          setSearch(value);
          if (value.trim()) setMobileList(true);
        }}
        view={view}
        onView={(next) => {
          setView(next);
          setMobileList(next !== "notes" || !(activeNoteId || activeAttachment));
        }}
        openTasks={openTasks}
        onShowList={() => setMobileList(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div
        className={"layout" + (narrow && mobileList ? " is-mobile-list" : "") + (dropActive ? " is-dragging" : "")}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <Sidebar
          workspaces={workspaces}
          workspaceId={workspaceId}
          onWorkspace={(id) => {
            setWorkspaceId(id);
            setActiveNoteId(null);
            setActiveAttachment(null);
            setSelection({ type: "all", id: null });
          }}
          onAddWorkspace={() => {
            setPrompt({
              title: "New workspace",
              label: "Workspace name",
              value: "",
              confirmLabel: "Create workspace",
              required: true,
              onSubmit: async (value) => {
                try {
                  const created = await request<WorkspaceModel>({
                    method: "post",
                    path: "/workspaces",
                    body: { name: value },
                  });
                  setWorkspaces((current) => [...current, created]);
                  setWorkspaceId(created.id);
                } catch (error) {
                  report(error, "The workspace could not be created.");
                  throw error;
                }
              },
            });
          }}
          onRenameWorkspace={() => {
            if (!workspace) return;
            const target = workspace.id;
            setPrompt({
              title: "Rename workspace",
              label: "Workspace name",
              value: workspace.name,
              confirmLabel: "Rename",
              required: true,
              onSubmit: async (value) => {
                try {
                  const updated = await request<WorkspaceModel>({
                    method: "patch",
                    path: "/workspaces/" + target,
                    body: { name: value },
                  });
                  setWorkspaces((current) => current.map((entry) => (entry.id === target ? updated : entry)));
                } catch (error) {
                  report(error, "The workspace could not be renamed.");
                  throw error;
                }
              },
            });
          }}
          onDeleteWorkspace={() => {
            if (!workspace) return;
            const target = workspace.id;
            const name = workspace.name;
            setConfirm({
              title: "Delete this workspace?",
              message: '"' + name + '" and everything inside it is deleted for good.',
              consequences: ["Every folder, note, file and task in it goes too.", "This is not the trash."],
              confirmLabel: "Delete workspace",
              onConfirm: async () => {
                try {
                  await request<null>({ method: "delete", path: "/workspaces/" + target });
                  setConfirm(null);
                  const remaining = workspaces.filter((entry) => entry.id !== target);
                  setWorkspaces(remaining);
                  const next = remaining[0];
                  setWorkspaceId(next ? next.id : null);
                  setActiveNoteId(null);
                  toast("Workspace deleted.", "success");
                } catch (error) {
                  report(error, "The workspace could not be deleted.");
                  throw error;
                }
              },
            });
          }}
          sort={sort}
          onSort={setSort}
          moveTarget={sort.key === "manual" && reorderTarget ? { label: reorderTarget.label } : null}
          onMoveUp={() => movePosition(-1)}
          onMoveDown={() => movePosition(1)}
          folders={folders}
          notes={notes}
          attachments={attachments}
          expanded={expanded}
          selection={selection}
          activeNoteId={activeNoteId}
          activeAttachmentId={activeAttachment ? activeAttachment.id : null}
          treeActions={treeActions}
          storage={{
            usedBytes: stats ? stats.attachment_bytes ?? 0 : 0,
            noteCount: stats ? stats.notes : notes.length,
            quotaBytes,
            stats: stats ?? null,
          }}
          uploadStatus={uploadStatus}
          onUploadClick={onPickFile}
          onNewNote={() => void newNote(targetFolder())}
          onOpenTrash={() => setTrashOpen(true)}
          onContextMenu={(x, y, title, items) => setMenu({ x, y, title, items })}
        />

        <main id="main" className="main" aria-live="polite">
          {view === "tasks" ? (
            <TaskPane workspaceId={workspaceId ?? ""} />
          ) : activeAttachment ? (
            <AttachmentView attachment={activeAttachment} onClose={() => setActiveAttachment(null)} />
          ) : editorNote ? (
            <Editor
              key={editorNote.id}
              note={editorNote}
              vaultState={vault}
              canEdit
              onSave={onSave}
              onDelete={() => deleteNote(editorNote.id)}
              onUnlock={() => window.dispatchEvent(new Event("notebook:unlock-vault"))}
            />
          ) : activeNote ? (
            <div className="pane-head">
              <h2 className="pane-head__title">{openingBody ? "Opening this note" : "This note is still sealed"}</h2>
              <p className="pane-head__sub">
                {openingBody
                  ? "Its body is sealed and is being opened in this browser."
                  : "Its body is sealed and the vault could not open it, so nothing is shown and nothing will be written over it."}
              </p>
            </div>
          ) : searching || loading ? (
            <div className="pane-head">
              <h2 className="pane-head__title">{searching ? "Search results" : "Loading this workspace"}</h2>
              <p className="pane-head__sub">
                {searching
                  ? notes.length + (notes.length === 1 ? " note matches " : " notes match ") + '"' + search.trim() + '"'
                  : "Folders, notes and files are on their way."}
              </p>
            </div>
          ) : workspaceEmpty ? (
            <EmptyState
              big
              mark="NB"
              body={
                locked
                  ? "Pick a note from the tree. Note bodies stay sealed until the vault is unlocked."
                  : "Pick a note from the tree, write a new one, or drop a file anywhere to attach it."
              }
              actions={
                <>
                  <button className="btn btn--primary" type="button" onClick={() => void newNote(targetFolder())}>
                    New note
                  </button>
                  <button className="btn btn--ghost" type="button" onClick={onPickFile}>
                    Upload file
                  </button>
                </>
              }
            />
          ) : null}

          {view === "notes" && !activeNote && !activeAttachment ? (
            <AttachmentsPanel
              workspaceId={workspaceId ?? ""}
              folderId={selection.type === "folder" ? selection.id : null}
              showEmptyState={!workspaceEmpty}
            />
          ) : null}
        </main>

        <button
          className="trash-fab"
          type="button"
          aria-label="Open the trash"
          title="Open the trash"
          onClick={() => setTrashOpen(true)}
        >
          <Icon name="trash" size={18} />
          {trashCount > 0 ? (
            <span className="trash-fab__badge" aria-hidden="true">
              {trashCount}
            </span>
          ) : null}
        </button>

        <Dropzone workspaceId={workspaceId ?? ""} folderId={targetFolder()} />

        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.docx,.doc,.csv,.json,.zip"
          onChange={(event) => {
            const files = event.target.files;
            const destination = uploadFolder.current;
            uploadFolder.current = null;
            if (files && files.length) void uploadFiles(files, destination ?? targetFolder());
            event.target.value = "";
          }}
        />

        {trashOpen ? <TrashPanel workspaceId={workspaceId ?? ""} onClose={() => setTrashOpen(false)} /> : null}
        {settingsOpen ? <SettingsDialog open onClose={() => setSettingsOpen(false)} /> : null}

        {menu ? (
          <ContextMenu items={menu.items} x={menu.x} y={menu.y} title={menu.title} onClose={() => setMenu(null)} />
        ) : null}

        {prompt ? (
          <PromptDialog
            open
            title={prompt.title}
            label={prompt.label}
            initialValue={prompt.value}
            confirmLabel={prompt.confirmLabel}
            required={prompt.required}
            onSubmit={async (value) => {
              await prompt.onSubmit(value);
              setPrompt(null);
            }}
            onCancel={() => setPrompt(null)}
          />
        ) : null}

        {confirm ? (
          <ConfirmDialog
            open
            title={confirm.title}
            message={confirm.message}
            {...(confirm.consequences ? { consequences: confirm.consequences } : {})}
            confirmLabel={confirm.confirmLabel}
            danger
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
          />
        ) : null}

        <VaultGate
          onConfigured={() => {
            setVault(vaultStatus());
            refresh();
          }}
          onUnlocked={() => setVault(vaultStatus())}
        >
          <VaultUnlockListener
            onUnlock={async (passphrase) => {
              const row = await request<{
                salt: string;
                iterations: number;
                check_iv: string;
                check_ct: string;
                configured: boolean;
              }>({ method: "get", path: "/vault" });
              await unlockVault(row, passphrase);
              setVault(vaultStatus());
              refresh();
            }}
          />
        </VaultGate>

        <span className="visually-hidden">{user ? user.id : ""}</span>
      </div>
    </>
  );
}

/** The open file, drawn in the main pane instead of the editor. */
function AttachmentView({ attachment, onClose }: { attachment: Attachment; onClose: () => void }): JSX.Element {
  const inline = attachment.mime_type.startsWith("image/") || attachment.mime_type === "application/pdf";
  return (
    <div className="preview">
      <div className="pane-head">
        <span className="pane-head__glyph" aria-hidden="true">
          <Icon name="file" size={18} />
        </span>
        <div className="pane-head__text">
          <h2 className="pane-head__title">{attachment.filename}</h2>
          <p className="pane-head__sub">
            {attachment.mime_type || "unknown type"} · {attachment.size} bytes · added 
            {new Date(attachment.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="preview__body">
        {inline ? (
          <img className="preview__image" src={attachmentApi.previewUrl(attachment.id)} alt={attachment.filename} />
        ) : (
          <div className="preview__placeholder">
            <span className="preview__glyph" aria-hidden="true">
              <Icon name="file" size={28} />
            </span>
            <p>This type cannot be shown in the page. Download it to open it.</p>
          </div>
        )}
      </div>
      <div className="preview__actions">
        <a className="btn btn--primary" href={attachmentApi.downloadUrl(attachment.id)}>
          Download
        </a>
        <a className="btn" href={attachmentApi.previewUrl(attachment.id)} target="_blank" rel="noreferrer">
          Open in a new tab
        </a>
        <button className="btn btn--ghost" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * The second way into the vault.
 *
 * panes/VaultGate owns the ordinary passphrase path. This listens for the one event the
 * editor's lock notice raises, so the notice has somewhere to send the reader without the
 * editor having to own a passphrase field of its own. It renders nothing.
 */
function VaultUnlockListener({ onUnlock }: { onUnlock: (passphrase: string) => Promise<void> }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRequest = (): void => setOpen(true);
    window.addEventListener("notebook:unlock-vault", onRequest);
    return () => window.removeEventListener("notebook:unlock-vault", onRequest);
  }, []);

  if (!open) return <span className="visually-hidden" />;

  return (
    <ConfirmDialog
      open
      title="Unlock the vault"
      message="The key is derived from your passphrase in this browser. It is never sent anywhere."
      confirmLabel="Unlock"
      onCancel={() => {
        setOpen(false);
        setError(null);
      }}
      onConfirm={async () => {
        try {
          await onUnlock(value);
          setOpen(false);
          setValue("");
          setError(null);
        } catch (thrown) {
          setError(thrown instanceof Error ? thrown.message : "That passphrase was refused.");
          throw thrown;
        }
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor="vault-unlock-passphrase">
          Passphrase
        </label>
        <div className="field__control">
          <input
            id="vault-unlock-passphrase"
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
          />
        </div>
        {error ? <p className="field__message field__message--error">{error}</p> : null}
      </div>
    </ConfirmDialog>
  );
}