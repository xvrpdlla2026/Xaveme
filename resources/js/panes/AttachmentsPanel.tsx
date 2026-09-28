/**
 * panes/AttachmentsPanel.tsx: the files inside one folder.
 *
 * A folder has no page of its own, so this is what the pane shows under it: the files the
 * folder holds, and, for the one that is selected, its preview and the five things that can be
 * done to it. The bytes are never read through JavaScript: download and preview are ordinary
 * URLs, which is what lets a large file stream to disk and lets the browser render a PDF.
 *
 * The panel uploads through its own file input as well as through the window drop affordance,
 * because a reader looking at a file list is exactly the reader who wants to add one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as attachmentApi from "../api/attachments";
import * as folderApi from "../api/folders";
import { ConfirmDialog, ContextMenu, PromptDialog } from "../components/dialogs";
import type { MenuItem } from "../components/dialogs";
import EmptyState from "../components/EmptyState";
import Icon from "../components/Icon";
import { useToast } from "../context/ToastContext";
import { extensionBadge, formatBytes, formatRelative, isPreviewableMime } from "../lib/format";
import type { Attachment, Folder } from "../types";

/** What the input accepts. The server enforces the same list, and a rejected file says so. */
const ACCEPT = "image/*,.pdf,.txt,.md,.docx,.doc,.csv,.json,.zip";

export function AttachmentsPanel({
  workspaceId,
  folderId,
  showEmptyState,
}: {
  workspaceId: string;
  folderId: string | null;
  /**
   * Whether the pane's own empty state is the one the reader should see. The page draws a card
   * of its own when the workspace holds nothing at all, and that card already offers both
   * things this one does, so on a workspace that empty this pane draws no second card and
   * simply waits for the first file. Every other case keeps it: with something in the
   * workspace, this is the only card that can name the folder it is about.
   */
  showEmptyState: boolean;
}) {
  const { toast } = useToast();
  const picker = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Attachment[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<Attachment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [moveAt, setMoveAt] = useState<{ x: number; y: number; attachment: Attachment } | null>(null);

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
        const [files, folderRows] = await Promise.all([
          attachmentApi.list(workspaceId, { folder_id: folderId }, { signal }),
          folderApi.list(workspaceId, {}, { signal }),
        ]);
        if (signal?.aborted) return;
        setRows(files);
        setFolders(folderRows);
      } catch (error) {
        if (signal?.aborted) return;
        report(error, "The files in this folder could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [workspaceId, folderId, report],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    // The open file belongs to the folder that was open: another folder's file has no preview
    // to show here.
    setSelectedId(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const upload = async (files: FileList): Promise<void> => {
    const list = Array.from(files);
    if (!list.length || !workspaceId || uploading) return;
    setUploading(true);
    let done = 0;
    for (const file of list) {
      setStatus("Uploading " + file.name + (list.length > 1 ? " (" + (done + 1) + " of " + list.length + ")" : ""));
      try {
        // The bytes go up as they are: the vault seals note bodies only, never files, so the flag
        // says false rather than claiming a seal that does not happen.
        const created = await attachmentApi.upload(workspaceId, { file, folder_id: folderId, encrypted: false });
        done += 1;
        setRows((current) => [...current, created]);
      } catch (error) {
        report(error, "The upload of " + file.name + " failed.");
        break;
      }
    }
    setUploading(false);
    if (done) {
      setStatus(done + (done === 1 ? " file" : " files") + " uploaded.");
      window.setTimeout(() => setStatus(null), 4000);
    } else {
      setStatus(null);
    }
  };

  const moveTo = async (attachment: Attachment, target: string | null): Promise<void> => {
    if ((attachment.folder_id ?? null) === target) return;
    try {
      await attachmentApi.update(attachment.id, { folder_id: target });
      toast('Moved "' + attachment.filename + '".', "success");
      setSelectedId(null);
      await load();
    } catch (error) {
      report(error, "The file could not be moved.");
    }
  };

  const moveItems = (attachment: Attachment): MenuItem[] => [
    {
      id: "root",
      label: "Move to the workspace root",
      disabled: (attachment.folder_id ?? null) === null,
      onSelect: () => void moveTo(attachment, null),
    },
    { id: "sep", label: "", separator: true },
    ...folders.map((folder) => ({
      id: folder.id,
      label: 'Into "' + folder.name + '"',
      disabled: attachment.folder_id === folder.id,
      onSelect: () => void moveTo(attachment, folder.id),
    })),
  ];

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const previewable = selected ? isPreviewableMime(selected.mime_type) : false;
  const isImage = selected ? selected.mime_type.toLowerCase().startsWith("image/") : false;

  return (
    <>
      <div className="pane-actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={!workspaceId || uploading}
          onClick={() => picker.current?.click()}
        >
          <Icon name="upload" size={14} />
          {uploading ? "Uploading..." : "Upload file"}
        </button>
        <p className={"upload-status" + (status ? "" : " is-hidden")} role="status">
          {status ?? ""}
        </p>
      </div>

      {selected ? (
        <div className="preview">
          <div className="pane-head">
            <span className="pane-head__glyph" aria-hidden="true">
              <Icon name="file" size={18} />
            </span>
            <div className="pane-head__text">
              <h2 className="pane-head__title">{selected.filename}</h2>
              <p className="pane-head__sub">
                {(selected.mime_type || "unknown type") +
                  " · " +
                  formatBytes(selected.size) +
                  " · added " +
                  formatRelative(selected.created_at)}
              </p>
            </div>
          </div>

          <div className="preview__body">
            {previewable && isImage ? (
              <img className="preview__image" src={attachmentApi.previewUrl(selected.id)} alt={selected.filename} />
            ) : previewable ? (
              // A PDF is previewed by the browser's own viewer, which is the only renderer here
              // that can page through one.
              <iframe
                className="preview__image"
                src={attachmentApi.previewUrl(selected.id)}
                title={selected.filename}
                style={{ width: "100%", height: "62vh" }}
              />
            ) : (
              <div className="preview__placeholder">
                <span className="preview__glyph" aria-hidden="true">
                  {extensionBadge(selected.filename, selected.mime_type)}
                </span>
                <p>This type cannot be shown in the page. Download it to open it.</p>
              </div>
            )}
          </div>

          <div className="preview__actions">
            <a className="btn btn--primary" href={attachmentApi.downloadUrl(selected.id)}>
              <Icon name="download" size={14} />
              Download
            </a>
            <a
              className="btn"
              href={attachmentApi.previewUrl(selected.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="external" size={14} />
              Open in a new tab
            </a>
            <button className="btn" type="button" onClick={() => setRenaming(selected)}>
              <Icon name="pencil" size={14} />
              Rename
            </button>
            <button
              className="btn"
              type="button"
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setMoveAt({ x: box.left, y: box.bottom + 6, attachment: selected });
              }}
            >
              <Icon name="layers" size={14} />
              Move to...
            </button>
            <button className="btn btn--danger-ghost" type="button" onClick={() => setPendingDelete(selected)}>
              <Icon name="trash" size={14} />
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {loading || !showEmptyState ? null : rows.length ? (
        <>
          <h3 className="pane-section">
            <span>Files</span>
            <span className="pane-section__count">{rows.length}</span>
          </h3>
          <div className="card-grid">
            {rows.map((row) => (
              <button
                key={row.id}
                className={"card card--file" + (row.id === selectedId ? " is-active" : "")}
                type="button"
                title={"Show " + row.filename}
                onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
              >
                <span className="card__glyph">{extensionBadge(row.filename, row.mime_type)}</span>
                <span className="card__title">{row.filename}</span>
                <span className="card__meta">{formatBytes(row.size) + " · " + formatRelative(row.created_at)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          body={
            folderId
              ? "No files in this folder yet. Upload one, or drop it anywhere on the window."
              : "No files in this workspace yet. Upload one, or drop it anywhere on the window."
          }
          actions={
            <button className="btn btn--primary" type="button" onClick={() => picker.current?.click()}>
              Upload file
            </button>
          }
        />
      )}

      <input
        ref={picker}
        className="visually-hidden"
        type="file"
        multiple
        accept={ACCEPT}
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length) void upload(files);
          event.target.value = "";
        }}
      />

      {moveAt ? (
        <ContextMenu
          items={moveItems(moveAt.attachment)}
          x={moveAt.x}
          y={moveAt.y}
          title={'Move "' + moveAt.attachment.filename + '"'}
          onClose={() => setMoveAt(null)}
        />
      ) : null}

      {renaming ? (
        <PromptDialog
          open
          title="Rename file"
          label="File name"
          initialValue={renaming.filename}
          confirmLabel="Rename"
          required
          onCancel={() => setRenaming(null)}
          onSubmit={async (value) => {
            try {
              const updated = await attachmentApi.update(renaming.id, { filename: value });
              setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
            } catch (error) {
              report(error, "The file could not be renamed.");
              throw error;
            }
            setRenaming(null);
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          danger
          icon="trash"
          title="Move this file to the trash?"
          message={'"' + pendingDelete.filename + '" leaves this folder, and its stored bytes go with it.'}
          consequences={[
            "It can be restored from the trash until it is purged.",
            "Emptying the trash destroys the stored bytes for good.",
          ]}
          confirmLabel="Move to trash"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await attachmentApi.remove(pendingDelete.id);
            } catch (error) {
              report(error, "The file could not be deleted.");
              throw error;
            }
            setRows((current) => current.filter((row) => row.id !== pendingDelete.id));
            setSelectedId(null);
            setPendingDelete(null);
            toast("File moved to the trash.", "success");
          }}
        />
      ) : null}
    </>
  );
}
