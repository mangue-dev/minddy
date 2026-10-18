import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadAttachment, resolveAttachmentObjectPath, signedAttachmentUrl } from "@/lib/server/attachments";
import { getPageFilePath } from "@/lib/server/page-files";
import { getProjectAccess } from "@/lib/server/project-access";
import { SITE_URL } from "@/lib/site";
import { sniffMimeType } from "@/lib/inline-safe";

/**
 * Images inside editor documents, for agents (MIN-728).
 *
 * Every editor writes an image as Markdown, `![alt](src)`, and its `src` is a
 * browser route that needs the person's session: `/api/attachments/file?path=…`
 * for descriptions, plans, comments and the notebook, and
 * `/api/projects/<id>/pages/files/<id>` for pages. Numo and MCP agents read
 * that Markdown, so they see the address but cannot open it. This module is
 * the one door that turns such a `src` back into the image, with the same
 * access rules as those routes:
 * - `projects/<project>/…` and page files: the caller must have access to
 *   that project;
 * - `chat/<user>/…` (the notebook): only that user.
 * Any other address is an outside image: its URL is returned as is, never
 * fetched by the server.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PAGE_FILE_PATH = new RegExp(`^/api/projects/(${UUID})/pages/files/(${UUID})$`, "i");
const PROJECT_UUID = new RegExp(`^${UUID}$`, "i");

/** Above this, the bytes are not embedded: the signed URL is the way in. */
export const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface DocumentImageRef {
  src: string;
  alt: string;
}

/** The images a Markdown document shows, in order, each address once. */
export function documentImages(markdown: string | null | undefined): DocumentImageRef[] {
  if (!markdown) return [];
  const found = new Map<string, DocumentImageRef>();
  // `![alt](dest "title")`, with the destination's `\(` `\)` `\\` escapes.
  const pattern = /!\[((?:[^\]\\]|\\.)*)\]\(((?:[^()\s\\]|\\.)+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(pattern)) {
    const src = match[2].replace(/\\(.)/g, "$1");
    if (!found.has(src)) found.set(src, { src, alt: match[1].replace(/\\(.)/g, "$1") });
  }
  return [...found.values()];
}

/**
 * Every image shown in the text of a read result — a description, a plan,
 * comments, a page body, the notebook — collected from all its strings, so a
 * tool reply can list what its reader can open (`images`).
 */
export function imagesIn(value: unknown): DocumentImageRef[] {
  const found = new Map<string, DocumentImageRef>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || node === null || node === undefined) return;
    if (typeof node === "string") {
      if (node.includes("![")) for (const image of documentImages(node)) found.set(image.src, image);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node === "object") for (const item of Object.values(node)) visit(item, depth + 1);
  };
  visit(value, 0);
  return [...found.values()];
}

/** Where a stored image lives, once its address is understood. */
type Located =
  | { kind: "attachment"; projectId: string | null; ownerId: string | null; storagePath: string }
  | { kind: "page-file"; projectId: string; fileId: string }
  | { kind: "external"; url: string };

/** Read an image address as one of the app's routes, or as an outside URL. */
export function locateDocumentImage(src: string): Located | null {
  let url: URL;
  try {
    url = new URL(src, SITE_URL);
  } catch {
    return null;
  }
  const site = new URL(SITE_URL);
  const sameOrigin = url.origin === site.origin || src.startsWith("/");
  if (!sameOrigin) {
    return url.protocol === "https:" || url.protocol === "http:"
      ? { kind: "external", url: url.toString() }
      : null;
  }
  if (url.pathname === "/api/attachments/file") {
    const path = url.searchParams.get("path") ?? "";
    const [family, owner] = path.split("/");
    if (path.includes("..") || path.split("/").length < 3) return null;
    if (family === "projects" && PROJECT_UUID.test(owner)) {
      return { kind: "attachment", projectId: owner, ownerId: null, storagePath: path };
    }
    if (family === "chat" && owner) {
      return { kind: "attachment", projectId: null, ownerId: owner, storagePath: path };
    }
    return null;
  }
  const page = PAGE_FILE_PATH.exec(url.pathname);
  if (page) return { kind: "page-file", projectId: page[1], fileId: page[2] };
  return null;
}

export type DocumentImage =
  | {
      kind: "stored";
      src: string;
      projectId: string | null;
      fileName: string;
      storagePath: string;
      mimeType: string | null;
    }
  | { kind: "external"; src: string; url: string };

/**
 * The image behind `src`, when `userId` may read it, or why not. `projectId`,
 * when the caller is scoped to one project, must be the image's project.
 */
export async function resolveDocumentImage(
  service: SupabaseClient,
  src: string,
  { userId, projectId = null }: { userId: string; projectId?: string | null }
): Promise<{ ok: true; image: DocumentImage } | { ok: false; reason: "unknown" | "forbidden" | "missing" }> {
  const located = locateDocumentImage(src.trim());
  if (!located) return { ok: false, reason: "unknown" };
  if (located.kind === "external") return { ok: true, image: { kind: "external", src, url: located.url } };

  const imageProject = located.projectId;
  if (imageProject) {
    if (projectId && projectId !== imageProject) return { ok: false, reason: "forbidden" };
    if (!await getProjectAccess(userId, imageProject)) return { ok: false, reason: "forbidden" };
  } else if (located.kind === "attachment" && located.ownerId !== userId) {
    return { ok: false, reason: "forbidden" };
  }

  if (located.kind === "page-file") {
    const file = await getPageFilePath(service, located.projectId, located.fileId);
    if (!file || !file.storage_path.startsWith(`projects/${located.projectId}/pages/`)) {
      return { ok: false, reason: "missing" };
    }
    return {
      ok: true,
      image: {
        kind: "stored", src, projectId: located.projectId, fileName: file.file_name,
        storagePath: file.storage_path, mimeType: file.mime_type || null,
      },
    };
  }
  return {
    ok: true,
    image: {
      kind: "stored", src, projectId: located.projectId,
      fileName: located.storagePath.split("/").at(-1) || "image",
      storagePath: located.storagePath, mimeType: null,
    },
  };
}

/**
 * The stored size of an image without reading it, or `null` when unknown.
 * An encrypted object is a little larger than its content: close enough to
 * decide whether it is worth reading inline.
 */
export async function storedDocumentImageSize(
  service: SupabaseClient,
  image: Extract<DocumentImage, { kind: "stored" }>
): Promise<number | null> {
  const path = await resolveAttachmentObjectPath(service, image.storagePath);
  const { data, error } = await service.storage.from("attachments").info(path);
  if (error || !data) return null;
  const size = Number((data as { size?: unknown }).size);
  return Number.isFinite(size) ? size : null;
}

/** The bytes of a stored image, with the type read from them. */
export async function readDocumentImage(
  service: SupabaseClient,
  image: Extract<DocumentImage, { kind: "stored" }>
): Promise<{ data: Buffer; mimeType: string } | null> {
  const data = await downloadAttachment(service, image.storagePath);
  if (!data) return null;
  const mimeType = sniffMimeType(data) ?? image.mimeType ?? "application/octet-stream";
  return { data, mimeType };
}

/** A short-lived address an agent can fetch the image from, without a session. */
export function signedDocumentImageUrl(
  service: SupabaseClient,
  image: Extract<DocumentImage, { kind: "stored" }>,
  expiresIn = 600
): Promise<string | null> {
  return signedAttachmentUrl(service, image.storagePath, { expiresIn, mimeType: image.mimeType });
}
