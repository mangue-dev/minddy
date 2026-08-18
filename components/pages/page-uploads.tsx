"use client";

// One page UPLOADS (MIN-280): what an image or file block has
// need to know about a sending in progress, and nothing more.
//
// The form is that of components/pages/pages-lookup.tsx, and for the same
// reason: the two block views are mounted as portals at the very bottom of
// the publisher, and have no way of finding the project themselves, the
// page or byte in flight. The surface provides a context for them.
//
// ── What the node keeps, and what it doesn't keep ──────────────────────────
//
// A submission lives in a REACT STATE, never in the document. The knot does not carry
// that a `uploadId` (not rendered in HTML, therefore never reread from the database) the time
// that the final address arrives. Two intended consequences:
//
// - closing the tab during a send does not leave a “in progress” block frozen
// for eternity in the body: when reloading, it is a block WITHOUT an address,
// that the view announces as a failure and that we delete with a gesture;
// - and the opposite: a sending which succeeds even though the user has already deleted
// the block does not write anything. The file becomes an orphan, as scanning
// pick up a week later (lib/server/page-files.ts).
//
// The original `File` is kept in memory as long as the sending has not
// successful: this is what allows you to TRY AGAIN without requesting the file again, and
// to display the local preview of an image before it is even gone.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/core";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { compressImage } from "@/lib/image-compress";
import {
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_FILE_MB,
  isImageMime,
} from "@/lib/page-files";

/** What the route renders when the file has arrived. */
export interface PageFileUploaded {
  id: string;
  src: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface PageUpload {
  id: string;
  /** The original file — kept for local preview and retrying. */
  file: File;
  status: "uploading" | "failed";
  /** 0 → 1. Remains at 0 as long as the browser has not issued anything. */
  progress: number;
  /** The local preview of an image, in `blob:`. Void for everything else. */
  previewUrl: string | null;
}

export interface PageUploads {
  /** The sending in progress (or failed) under this identifier, if there is one. */
  get: (uploadId: string) => PageUpload | undefined;
  /** Restart a failed upload, with the file already in memory. */
  retry: (uploadId: string) => void;
}

const Context = createContext<PageUploads | null>(null);

export function PageUploadsProvider({
  value,
  children,
}: {
  value: PageUploads;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePageUploadsContext(): PageUploads | null {
  return useContext(Context);
}

/* ── The engine ─────────────────────────────── ─────────────────────────────── */

/** Re-encoding a gif kills its animation, an svg its vectors: these leave
 as is. Exact mirror of lib/use-attachment-uploads.ts. */
function isCompressible(type: string): boolean {
  return isImageMime(type) && type !== "image/gif" && type !== "image/svg+xml";
}

/** Align the displayed name extension to the re-encoded blob (png → webp). */
function renameForType(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : null;
  if (!ext) return name;
  return `${name.replace(/\.[a-zA-Z0-9]+$/, "")}.${ext}`;
}

/** The node that carries this `uploadId`, if it is still in the document. */
function findUploadNode(editor: Editor, uploadId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.uploadId === uploadId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * The sending itself, in `XMLHttpRequest` and not in `fetch`.
 *
 * This is not nostalgia: `fetch` does not report the progress of a request body
 * (the request flows are not deployed everywhere, and do not exist
 * at all on Safari). Without progress, an 8MB send over a slow connection is a gray block that doesn't move for fifteen seconds — the exact moment we start pasting again.
 */
function postFile(
  url: string,
  file: File,
  onProgress: (ratio: number) => void
): Promise<PageFileUploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }
      const data = payload as (PageFileUploaded & { error?: string }) | null;
      if (request.status >= 200 && request.status < 300 && data?.src) {
        resolve(data);
      } else {
        reject(new Error(data?.error || `upload failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error("network error"));
    request.send(form);
  });
}

/**
 * The hook that mounts the surface (components/pages/page-view.tsx): it holds the
 * queue of sendings and SEWS the node when the address arrives.
 *
 * `editorRef` rather than the editor himself: the editor is born after the first
 * rendered, and a paste-initiated send should be able to read it at the time it completed, not at the time the hook was called.
 */
export function usePageUploads(
  projectId: string,
  pageId: string,
  editorRef: { current: Editor | null }
): PageUploads & {
  /** Place the appropriate block on the file, and start sending it. */
  addFiles: (files: Iterable<File>, options?: { at?: number }) => void;
} {
  const t = useTranslations("Pages");
  const [uploads, setUploads] = useState<Map<string, PageUpload>>(new Map());
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const patch = useCallback((uploadId: string, next: Partial<PageUpload>) => {
    setUploads((prev) => {
      const current = prev.get(uploadId);
      if (!current) return prev;
      const copy = new Map(prev);
      copy.set(uploadId, { ...current, ...next });
      return copy;
    });
  }, []);

  const drop = useCallback((uploadId: string) => {
    setUploads((prev) => {
      const current = prev.get(uploadId);
      if (!current) return prev;
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      const copy = new Map(prev);
      copy.delete(uploadId);
      return copy;
    });
  }, []);

  // `blob:` survives unmount if not revoked — one page
  // opening and closing ten times would retain ten images in memory.
  const uploadsAtUnmount = useRef(uploads);
  uploadsAtUnmount.current = uploads;
  useEffect(
    () => () => {
      for (const upload of uploadsAtUnmount.current.values()) {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      }
    },
    []
  );

  const send = useCallback(
    (uploadId: string, file: File) => {
      patch(uploadId, { status: "uploading", progress: 0 });
      void (async () => {
        try {
          // A screenshot comes out at 4 MB from a recent Mac for a rendering that
          // don't ask for a quarter. Same recompression as the resources of
          // ticket, therefore same visual result and the same respect for gifs and
          // svg (lib/image-compress.ts).
          const blob = isCompressible(file.type)
            ? await compressImage(file, {
                maxDim: 2048,
                maxBytes: 2.5 * 1024 * 1024,
              })
            : file;
          const payload =
            blob === file
              ? file
              : new File(
                  [blob],
                  renameForType(file.name, blob.type || file.type),
                  { type: blob.type || file.type }
                );

          const result = await postFile(
            `/api/projects/${projectId}/pages/${pageId}/files`,
            payload,
            (ratio) => patch(uploadId, { progress: ratio })
          );

          const editor = editorRef.current;
          if (!editor || editor.isDestroyed) {
            drop(uploadId);
            return;
          }
          const pos = findUploadNode(editor, uploadId);
          // The block was deleted during sending: nothing is written. The file
          // start with orphan scanning — better one byte too many
          // as a block which reappears under the cursor.
          if (pos === null) {
            drop(uploadId);
            return;
          }
          const node = editor.state.doc.nodeAt(pos);
          if (!node) {
            drop(uploadId);
            return;
          }
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                uploadId: null,
                src: result.src,
                ...(node.type.name === "pageFile"
                  ? {
                      name: result.file_name,
                      size: result.size_bytes,
                      mime: result.mime_type,
                    }
                  : {}),
              });
              return true;
            })
            .run();
          drop(uploadId);
        } catch {
          patch(uploadId, { status: "failed" });
        }
      })();
    },
    [drop, editorRef, pageId, patch, projectId]
  );

  const addFiles = useCallback(
    (files: Iterable<File>, options: { at?: number } = {}) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;

      let at = options.at;
      for (const file of files) {
        // A refusal BEFORE the block is a refusal that nothing in the document
        // will show: without this toast, pasting a 15 MB capture would not
        //absolutely nothing on screen — the exact symptom this ticket is causing.
        if (file.size === 0) {
          toast.error(t("uploadEmpty", { name: file.name }));
          continue;
        }
        // The size is refused BEFORE placing the block: a failed block in advance
        // teaches the user nothing more than this immediate message, and it
        // leaves a hole in the document to clean up by hand. The server
        // recheck on his side.
        if (file.size > MAX_PAGE_FILE_BYTES) {
          toast.error(t("uploadTooLarge", { name: file.name, max: MAX_PAGE_FILE_MB }));
          continue;
        }

        const uploadId = crypto.randomUUID();
        const image = isImageMime(file.type);

        setUploads((prev) => {
          const copy = new Map(prev);
          copy.set(uploadId, {
            id: uploadId,
            file,
            status: "uploading",
            progress: 0,
            previewUrl: image ? URL.createObjectURL(file) : null,
          });
          return copy;
        });

        const attrs = image
          ? { type: "image", attrs: { uploadId } }
          : {
              type: "pageFile",
              attrs: {
                uploadId,
                name: file.name,
                size: file.size,
                mime: file.type || null,
              },
            };
        const chain = editor.chain().focus();
        if (at === undefined) chain.insertContent(attrs);
        else chain.insertContentAt(at, attrs);
        chain.run();
        // The files of the same release follow each other, in the order in which we have them
        // taken — otherwise, they would all pile up in the same position, so at
        // l'envers.
        if (at !== undefined) at = editor.state.selection.to;

        send(uploadId, file);
      }
    },
    [editorRef, send, t]
  );

  const retry = useCallback(
    (uploadId: string) => {
      const upload = uploadsRef.current.get(uploadId);
      if (!upload) return;
      if (upload.file.size > MAX_PAGE_FILE_BYTES) return;
      send(uploadId, upload.file);
    },
    [send]
  );

  const get = useCallback((uploadId: string) => uploads.get(uploadId), [uploads]);

  return useMemo(
    () => ({ get, retry, addFiles }),
    [addFiles, get, retry]
  );
}
