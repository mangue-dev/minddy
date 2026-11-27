import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  downloadAttachment,
  opaqueAttachmentPath,
  uploadPrivateAttachmentObject,
} from "@/lib/server/attachments";
import { projectStorageAllowed } from "@/lib/server/storage-quota";
import { attachmentFileUrl } from "@/lib/resource-links";
import { sniffMimeType } from "@/lib/inline-safe";

/**
 * Images an agent writes into a text (MIN-1030).
 *
 * Every editor stores an image as Markdown, `![alt](src)`, whose `src` is the
 * access-checked read route of an object under `projects/<id>/` (MIN-728).
 * A person gets that address by pasting an image into an editor. Numo and MCP
 * agents have no browser, so this module is their door to the same address:
 * it stores the bytes and returns the Markdown to write. Nothing else changes:
 * the object has no row, the nightly sweep keeps it while a text cites it
 * (lib/server/upload-citations.ts), and readers open it like any other image.
 *
 * Callers have checked that the actor may comment in the project.
 */

/** The same cap as the images an agent reads inline (document-images.ts). */
export const MAX_INLINE_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** What an `<img>` shows as is: the bitmap types of lib/inline-safe.ts. */
const BITMAP_TYPES: ReadonlySet<string> = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif",
]);

export interface InlineImage {
  /** The address to write, exactly, as the image's destination. */
  src: string;
  /** The image as Markdown, ready to paste on its own line. */
  markdown: string;
  mime_type: string;
  size_bytes: number;
}

export type InlineImageResult =
  | { ok: true; image: InlineImage }
  | { ok: false; code: "invalid" | "not_found" | "quota" | "storage"; message: string };

/** Alt text that cannot close the brackets it is written in. */
function altText(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 200).replace(/[\\[\]]/g, "\\$&");
}

/** The Markdown of an image stored at `src`. */
export function inlineImageMarkdown(src: string, alt?: string | null): string {
  return `![${altText(alt)}](${src})`;
}

/**
 * Store `data` as an image of `projectId` and return the Markdown that shows
 * it. The type is read from the bytes, never taken from the caller: a file
 * that is not a bitmap image is refused, so a text can only embed what an
 * `<img>` displays.
 */
export async function storeInlineImage(
  service: SupabaseClient,
  args: { projectId: string; data: Buffer; alt?: string | null }
): Promise<InlineImageResult> {
  const { data } = args;
  if (data.byteLength === 0) return { ok: false, code: "invalid", message: "Empty file." };
  if (data.byteLength > MAX_INLINE_IMAGE_UPLOAD_BYTES) {
    return { ok: false, code: "invalid", message: "Image exceeds the 10 MB cap." };
  }
  const mime = sniffMimeType(data);
  if (!mime || !BITMAP_TYPES.has(mime)) {
    return {
      ok: false, code: "invalid",
      message: "Not an image a text can show: send a PNG, JPEG, GIF, WebP or AVIF file.",
    };
  }
  // The same margin as the browser's upload route: an encrypted object is a
  // little larger than its content.
  if (!(await projectStorageAllowed(service, args.projectId, Math.ceil(data.byteLength * 1.4) + 4096))) {
    return { ok: false, code: "quota", message: "The project's storage quota is exceeded." };
  }
  const path = opaqueAttachmentPath(`projects/${args.projectId}`);
  try {
    await uploadPrivateAttachmentObject(service, path, data, mime);
  } catch {
    return { ok: false, code: "storage", message: "The image could not be stored." };
  }
  const src = attachmentFileUrl(path);
  return {
    ok: true,
    image: { src, markdown: inlineImageMarkdown(src, args.alt), mime_type: mime, size_bytes: data.byteLength },
  };
}

/**
 * The image of a file resource of `projectId`, as Markdown. The bytes are
 * copied into an object of their own: the text keeps its image when the
 * resource is removed, and the resource keeps its file when the text is.
 * Its file name is the default alt text.
 */
export async function inlineImageFromResource(
  service: SupabaseClient,
  args: { projectId: string; resourceId: string; alt?: string | null; fileName?: string | null }
): Promise<InlineImageResult> {
  const { data: row, error } = await service
    .from("attachments")
    .select("id, kind, storage_path")
    .eq("id", args.resourceId)
    .eq("project_id", args.projectId)
    .maybeSingle();
  if (error) return { ok: false, code: "storage", message: error.message };
  if (!row || row.kind !== "file" || typeof row.storage_path !== "string") {
    return { ok: false, code: "not_found", message: "No file resource with this id in this project." };
  }
  const data = await downloadAttachment(service, row.storage_path);
  if (!data) return { ok: false, code: "not_found", message: "The resource's file is unavailable." };
  return storeInlineImage(service, { projectId: args.projectId, data, alt: args.alt ?? args.fileName });
}
