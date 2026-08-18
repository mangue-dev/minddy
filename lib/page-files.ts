/**
 * One-page FILES (MIN-280) — the address, and nothing else.
 *
 * This module is the only thing that the four surfaces of the subject share: the
 * two blocks (image and file), the publisher who uploads, the route which serves the
 * bytes, and the housekeeping which compares the bodies to the lines of `page_files`. He doesn't
 * speaks neither to the base nor to the storage — it only knows one FORM of URL and knows the
 * read both ways.
 *
 * ## Why a URL, and not the storage path
 *
 * The node of a block carries `src`, and this `src` is the address of a ROUTE of
 * the application (`/api/projects/{project}/pages/files/{file}`):
 *
 * - this is not a signed URL: those expire in ten minutes, and a
 * document is reread months later;
 * - it is not a bucket path: copied in a thousand documents, it is not
 * never moves again, and it tells whoever reads the body where the bytes are stored;
 * - it's an INDIRECTION by identifier, so exactly what the block
 * subpage made with `pageId` — the line `page_files` remains the truth, and the
 * road will seek the path of the moment.
 *
 * And this is also what makes markdown projection possible without a base of
 * data: `![caption](/api/…)` is written and reread in the head, while a bare id
 * would have asked the projection — synchronous, mounted in a server function —
 * to resolve one URL per file.
 *
 * The id is REDUCED from the URL ({@link pageFileIdFromSrc}). Wear it in
 * second attribute would make two truths for a single thing, and it is always the
 * copy that expires.
 */

import { normalizePageUrl } from "@/lib/page-content-schema";

/** Aligned with ticket resources, but tighter: a page body in
    carries several, and 10 MB is already a very generous screenshot. */
export const MAX_PAGE_FILE_BYTES = 10 * 1024 * 1024;

/** What the limit displays to the user, in megabytes. */
export const MAX_PAGE_FILE_MB = 10;

/** `projects/{project}/pages/{page}/{file}/{name}` — the family of paths of
    page files, IN the project resources prefix.

    A `pages/…` prefix at the root of the bucket would have meant a branch of
    more in the storage insertion policy AND one more family in the
    read gate (`/api/attachments/file`), for the same word access rule
    for word: “project member”. Store under `projects/{id}/` the data of a
    coup — a page file is a project file, like the others. */
export function pageFileStoragePrefix(projectId: string, pageId: string): string {
  return `projects/${projectId}/pages/${pageId}`;
}

/** L'adresse publique (au sens : de l'application) d'un fichier de page. */
export function pageFileUrl(projectId: string, fileId: string): string {
  return `/api/projects/${projectId}/pages/files/${fileId}`;
}

const PAGE_FILE_PATH_RE =
  /^\/api\/projects\/([0-9a-fA-F-]{36})\/pages\/files\/([0-9a-fA-F-]{36})$/;

/**
 * The couple (project, file) behind a `src`, whatever its ORIGIN.
 *
 * The origin is where this module has already lost an image in production. THE
 * document stores a RELATIVE address (`/api/…`), but copy-paste a block
 * image does not copy the document: the clipboard goes through HTML, and
 * Chrome ABSOLUTIZES the `src` — the same image comes back pasted in
 * `http://localhost:3000/api/…`, which still works on the station, and does not
 * charge nothing else anywhere else. The file block stores its address
 * in a `data-src` that the browser does not touch: it has never had the
 * problem, and that's what pointed to the culprit.
 *
 * So we read the PATH, not the entire string. The compensation assumed:
 * address of this form on a third party domain is counted as ours. She doesn't
 * does not occur, and the asymmetry is on the right side wherever this test is used — the
 * orphan scanning keeps one file too many rather than deleting one
 * which the document still shows (lib/server/page-files.ts).
 */
function matchPageFileSrc(src: unknown): RegExpExecArray | null {
  if (typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  let path = trimmed;
  if (!path.startsWith("/")) {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }
  return PAGE_FILE_PATH_RE.exec(path);
}

/** The id of the line `page_files` behind a `src`, or `null` when the `src`
    points elsewhere — an external image pasted from the web is one, and it
    is perfectly legitimate: it simply does not cost us anything. */
export function pageFileIdFromSrc(src: unknown): string | null {
  return matchPageFileSrc(src)?.[2] ?? null;
}

/** The project named by a page file `src`, or `null`. */
export function pageFileProjectFromSrc(src: unknown): string | null {
  return matchPageFileSrc(src)?.[1] ?? null;
}

/**
 * The address as we agree to STORE it: the relative form for our
 * files, the original string for everything else — and `null` for what we
 * refuse.
 *
 * To be called at the DOOR — when an address enters a document from
 * HTML or markdown (blocks/image.ts, blocks/file.ts). Recognize a
 * absolute address when reading repairs the use; normalize it on entry
 * prevents it from being written, and that's the half that counts: an absolute `src`
 * stored in a body bears the origin of the post which stuck.
 *
 * And since MIN-350, the TRIE gate also on the protocol
 * ({@link normalizePageUrl}): a `javascript:` pasted in the `data-src` of a
 * block file ended in the `href` of a real anchor, than an ordinary click
 * really follows (components/pages/blocks/file-view.tsx). The writing guardrail
 * (lib/server/pages.ts) already refuses to save it; this one prevents it
 * to exist in the editor, even before saving.
 */
export function normalizePageFileSrc(src: unknown): string | null {
  const safe = normalizePageUrl(src);
  if (!safe) return null;
  const match = matchPageFileSrc(safe);
  return match ? pageFileUrl(match[1], match[2]) : safe;
}

/**
 * The address to which a block file DOWNLOADS.
 *
 * Two forms of `src` coexist, and only one knows what to do with a parameter:
 *
 * - the APPLICATION address (the one stored in the document) responds with
 * a signed redirect, and `?download=1` tells it to add the layout
 * " attachment " ;
 * - on a published page (MIN-283), the `src` is already a SIGNED URL of the
 * storage, the disposition of which was decided upon signature. Stick it back on
 * `download` makes it a SECOND parameter of the same name, and storage responds
 * 400 (“querystring/download must be string”): the reader receives a
 * error message where he expected his file.
 *
 * Hence the rule, here and not in the view: it is a property of the address.
 *
 * `null` when the address is refused (MIN-350): the view then does not display
 * anchor at all, rather than an anchor towards a protocol that we don't want
 * suivre.
 */
export function fileDownloadHref(src: string): string | null {
  const ours = normalizePageFileSrc(src);
  if (!ours) return null;
  if (!pageFileIdFromSrc(ours)) return ours;
  return `${ours}?download=1`;
}

/**
 * Files CITED by a page body, read on its JSON.
 *
 * On the JSON and not on a mounted ProseMirror document: the caller is the
 * housekeeping (lib/server/retention.ts), which reads baselines into a function
 * server and has neither DOM nor editor at its disposal. The crossing is blind to
 * Node TYPE, intentionally — any `src` attribute that resembles the address
 * of a page file counts. One more block that would carry one (a video,
 * an attachment in a leaflet) is therefore covered in advance, and the worst case
 * of this width is to keep one file too many: never to delete one.
 */
export function pageFileIdsInBody(body: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const value of Object.values(record)) {
      if (typeof value === "string") {
        const id = pageFileIdFromSrc(value);
        if (id) ids.add(id);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  walk(body);
  return ids;
}

/* ── Ce qu'on affiche d'un fichier ────────────────────────────────────────── */

/** `1,4 Mo` — the size of a file, in units that the eye reads at once.
    Deliberately without i18n: a number and a unit symbol, identical in
    both languages ​​up to the comma, which `Intl` already sets correctly. */
export function formatFileSize(bytes: number, locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value);
  return `${formatted} ${units[unit]}`;
}

/** An image, in the sense of this module: what goes into a `<img>`. */
export function isImageMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

/** Storage keys refuse the exotic; the DISPLAYED name keeps it. Mirror
    exact du nettoyeur des ressources (lib/use-attachment-uploads.ts). */
export function sanitizeFileKey(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "fichier").slice(-140);
}
