"use client";

// Images in descriptions and in the notebook (MIN-728). Pages keep their own
// files route; every other editor sends images through the private attachment
// door, under the surface's scope — `projects/<id>` for a description, the
// account's own `chat/<userId>` for the notebook — and stores the address of
// the access-checked read route as the image's `src`. Files other than images
// stay a page feature.

import { useCallback } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { MAX_ATTACHMENT_UPLOAD_BYTES } from "@/lib/attachment-upload-limits";
import {
  postFile,
  useEditorUploads,
  type EditorUploads,
  type PageFileUploaded,
  type UploadFile,
} from "@/components/pages/page-uploads";

/**
 * Whether a document still holds an image whose bytes are being uploaded: its
 * address arrives when the upload ends, so a form submitted before then would
 * store an image without one.
 */
export function hasPendingUploads(node: JSONContent | null | undefined): boolean {
  if (!node) return false;
  if (typeof node.attrs?.uploadId === "string" && node.attrs.uploadId) return true;
  return (node.content ?? []).some(hasPendingUploads);
}

/** The stable address an uploaded image is read from. */
export function attachmentImageSrc(storagePath: string): string {
  return `/api/attachments/file?path=${encodeURIComponent(storagePath)}`;
}

interface AttachmentUploaded {
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

/** Image uploads for an editor whose files live under `scope`. */
export function useAttachmentImageUploads(
  editorRef: { current: Editor | null },
  scope: string
): EditorUploads {
  const upload = useCallback<UploadFile>(
    async (file, onProgress): Promise<PageFileUploaded> => {
      const stored = await postFile<AttachmentUploaded>("/api/attachments/upload", file, onProgress, {
        fields: { prefix: scope },
        accept: (data) => typeof (data as { storage_path?: unknown }).storage_path === "string",
      });
      return {
        id: stored.storage_path,
        src: attachmentImageSrc(stored.storage_path),
        file_name: stored.file_name,
        mime_type: stored.mime_type,
        size_bytes: stored.size_bytes,
      };
    },
    [scope]
  );
  return useEditorUploads(editorRef, {
    upload,
    maxBytes: MAX_ATTACHMENT_UPLOAD_BYTES,
    imagesOnly: true,
  });
}
