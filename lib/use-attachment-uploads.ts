"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { getSupabase } from "@/lib/supabase";
import { compressImage } from "@/lib/image-compress";
import type { AttachmentInput } from "@/lib/types";

/** Server-checked too (parseAttachmentsInput) — keep the two in sync. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ATTACHMENTS = 10;

export interface PendingAttachment extends AttachmentInput {
  localId: string;
  status: "uploading" | "done";
}

/** Re-encoding a gif kills the animation, an svg its vectors — upload as-is. */
function isCompressible(type: string): boolean {
  return (
    type.startsWith("image/") && type !== "image/gif" && type !== "image/svg+xml"
  );
}

/** Storage keys reject most exotic characters; the display name keeps them. */
function sanitizeKeyPart(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "fichier").slice(-140);
}

/** Align the display name's extension with the re-encoded blob (png → webp). */
function renameForType(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : null;
  if (!ext) return name;
  const base = name.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${base}.${ext}`;
}

/**
 * Shared upload state for every attachment composer (comments, issue panel,
 * create dialog, Numo shell). Files go DIRECTLY from the browser to the private
 * `attachments` bucket (storage RLS gates the path prefix) — the DB rows are
 * created server-side at submit time from `inputs`. Abandoned uploads are
 * tolerated orphans.
 *
 * `getPrefix` returns the path family, e.g. `projects/${projectId}` or
 * `chat/${userId}`.
 */
export function useAttachmentUploads(
  getPrefix: () => string,
  {
    max = MAX_ATTACHMENTS,
    onUploaded,
  }: {
    max?: number;
    /** Fired as each file lands in storage — for surfaces that register rows
        immediately (issue panel) instead of at submit time (composers). */
    onUploaded?: (input: AttachmentInput, localId: string) => void;
  } = {}
) {
  const t = useTranslations("Attachments");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // addFiles is called from paste/drop handlers whose closures can be stale.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const prefix = getPrefix().replace(/\/+$/, "");

      let slots = max - pendingRef.current.length;
      for (const file of list) {
        if (slots <= 0) {
          toast.error(t("tooMany", { max }));
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(t("tooLarge", { name: file.name, max: 20 }));
          continue;
        }
        slots -= 1;

        const localId = crypto.randomUUID();
        const entry: PendingAttachment = {
          localId,
          status: "uploading",
          storage_path: "",
          file_name: file.name || "fichier",
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        };
        setPending((prev) => [...prev, entry]);

        void (async () => {
          try {
            const blob = isCompressible(entry.mime_type)
              ? await compressImage(file, { maxDim: 2048, maxBytes: 2.5 * 1024 * 1024 })
              : file;
            const mime = blob.type || entry.mime_type;
            const fileName =
              blob !== file ? renameForType(entry.file_name, mime) : entry.file_name;
            const path = `${prefix}/${localId}/${sanitizeKeyPart(fileName)}`;

            const { error } = await getSupabase()
              .storage.from("attachments")
              .upload(path, blob, { contentType: mime });
            if (error) throw error;

            setPending((prev) =>
              prev.map((p) =>
                p.localId === localId
                  ? {
                      ...p,
                      status: "done",
                      storage_path: path,
                      file_name: fileName,
                      mime_type: mime,
                      size_bytes: blob.size,
                    }
                  : p
              )
            );
            onUploadedRef.current?.(
              {
                storage_path: path,
                file_name: fileName,
                mime_type: mime,
                size_bytes: blob.size,
              },
              localId
            );
          } catch {
            toast.error(t("uploadFailed", { name: entry.file_name }));
            setPending((prev) => prev.filter((p) => p.localId !== localId));
          }
        })();
      }
    },
    [getPrefix, max, t]
  );

  // No storage delete policy for users — the dropped object stays orphaned,
  // same policy as an abandoned composer.
  const remove = useCallback((localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const clear = useCallback(() => setPending([]), []);

  const inputs = useMemo<AttachmentInput[]>(
    () =>
      pending
        .filter((p) => p.status === "done")
        .map(({ storage_path, file_name, mime_type, size_bytes }) => ({
          storage_path,
          file_name,
          mime_type,
          size_bytes,
        })),
    [pending]
  );

  const uploading = pending.some((p) => p.status === "uploading");

  return { pending, addFiles, remove, clear, inputs, uploading };
}
