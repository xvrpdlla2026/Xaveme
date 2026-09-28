/**
 * panes/Dropzone.tsx: the whole-window drop affordance.
 *
 * The overlay is always mounted and the stylesheet decides when it is visible, off the
 * is-dragging class on <body>: a React render per drag event would be a render of the whole
 * workspace to show a dashed box. The listeners sit on the window rather than on a pane,
 * because a file dropped on the rail or the top bar is the same intention as one dropped on
 * the canvas.
 *
 * The upload runs here, and it yields to the page's own drop handler. The workspace handles
 * a drop that lands inside it and calls preventDefault, so that flag is what keeps one drop
 * from being stored twice.
 */

import { useCallback, useEffect, useRef } from "react";
import * as attachmentApi from "../api/attachments";
import { status as vaultStatus } from "../lib/crypto";
import { useToast } from "../context/ToastContext";

export function Dropzone({ workspaceId, folderId }: { workspaceId: string; folderId: string | null }) {
  const { toast } = useToast();

  // The window listeners are registered once and read the current props through refs: a drop
  // that lands after a folder change has to go where the folder is now, not where it was when
  // the listener was attached.
  const workspace = useRef(workspaceId);
  workspace.current = workspaceId;
  const target = useRef<string | null>(folderId);
  target.current = folderId;
  const depth = useRef(0);
  const uploading = useRef(false);

  /** The one place the body class is written, so it cannot get out of step with itself. */
  const show = useCallback((visible: boolean): void => {
    document.body.classList.toggle("is-dragging", visible);
  }, []);

  const upload = useCallback(
    async (files: FileList): Promise<void> => {
      const id = workspace.current;
      const list = Array.from(files);
      if (!id || !list.length || uploading.current) return;
      uploading.current = true;
      const sealed = vaultStatus() !== "off";
      if (list.length > 1) toast("Uploading " + list.length + " files...", "info");
      let done = 0;
      for (const file of list) {
        try {
          await attachmentApi.upload(id, { file, folder_id: target.current, encrypted: sealed });
          done += 1;
        } catch (error) {
          toast(error instanceof Error ? error.message : "The upload of " + file.name + " failed.", "error");
          break;
        }
      }
      uploading.current = false;
      const first = list[0];
      if (done === 1 && first) toast('Added "' + first.name + '".', "success");
      else if (done > 1) toast("Added " + done + " files.", "success");
    },
    [toast],
  );

  useEffect(() => {
    const carriesFiles = (event: DragEvent): boolean => {
      const types = event.dataTransfer ? event.dataTransfer.types : null;
      if (!types) return false;
      for (let index = 0; index < types.length; index += 1) {
        if (types[index] === "Files") return true;
      }
      return false;
    };

    // A drag over a child element fires enter on it and leave on the one before, so the
    // counter is what keeps the overlay up while the pointer moves inside the window.
    const onEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth.current += 1;
      show(true);
    };
    const onOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (): void => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) show(false);
    };
    const onDrop = (event: DragEvent): void => {
      depth.current = 0;
      show(false);
      const files = event.dataTransfer ? event.dataTransfer.files : null;
      if (!files || !files.length) return;
      // The page's own drop handler runs first and takes this drop.
      if (event.defaultPrevented) return;
      event.preventDefault();
      void upload(files);
    };
    const onEnd = (): void => {
      depth.current = 0;
      show(false);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onEnd);
      show(false);
    };
  }, [show, upload]);

  return (
    <div className="dropzone" aria-hidden="true">
      <div className="dropzone__inner">
        <strong>Drop files to attach</strong>
        <span>They are uploaded into the folder you are in and listed with this workspace's files.</span>
      </div>
    </div>
  );
}
