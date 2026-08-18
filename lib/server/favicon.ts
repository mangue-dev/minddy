import "server-only";

import { extractMetaContent, extractTitleText, parseAttributes, scanTags } from "@/lib/server/html-meta";
import { SafeFetchError, assertPublicHttpUrl, safeFetch } from "@/lib/server/safe-fetch";
import { withUrlScheme } from "@/lib/url-normalize";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Resolving the favicon of a live site (MIN-62), scope of the AutoKap
 * pattern (favicon-resolver.ts + refetch-icon). The project side icon storage lives
 * next to it, in [project-icon.ts](./project-icon.ts) — here we just
 * find and download the image.
 *
 * The server fetches a URL provided by the user: everything goes through
 * [safe-fetch.ts](./safe-fetch.ts), which only accepts http(s) to public IP
 *, **connects to the address it has validated** (anti-rebinding),
 * revalidates each redirection, and time limit and bytes read. And the reported HTML
 * is parsed by [html-meta.ts](./html-meta.ts), each function
 * is linear — a hostile page costs the price of its size, no more.
 */

const MAX_ICON_BYTES = 512 * 1024; // 512 Ko
const MAX_HTML_BYTES = 1024 * 1024; // 1 MB — we only read the HTML for the <head>
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = `${SITE_NAME}-favicon/1.0 (+${SITE_URL})`;

/** MIME accepted → extension stored. No SVG (script-capable). */
export const ICON_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/ico": "ico",
};

/** Typed error so that the route responds with the correct ApiErrors key. */
export class FaviconError extends Error {
  constructor(public readonly key: "invalidUrl" | "notFound") {
    super(key);
  }
}

/** An unrecoverable URL remains unrecoverable; everything else (site off,
 disproportionate body, endless redirection) is just an absence of favicon. */
function toFaviconError(err: unknown): FaviconError {
  if (err instanceof FaviconError) return err;
  if (err instanceof SafeFetchError && err.reason === "url") {
    return new FaviconError("invalidUrl");
  }
  return new FaviconError("notFound");
}

export function iconExtFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ICON_MIME_EXT[mime] ?? null;
}

/** guarded fetch: protocol, pinned public IP, redirects re-validated,
 byte cap and global delay. */
async function guardedFetch(
  rawUrl: string | URL,
  maxBytes: number,
  onOverflow: "error" | "truncate" = "error"
) {
  try {
    return await safeFetch(rawUrl, {
      maxBytes,
      onOverflow,
      maxRedirects: MAX_REDIRECTS,
      timeoutMs: FETCH_TIMEOUT_MS,
      headers: { "user-agent": USER_AGENT },
    });
  } catch (err) {
    throw toFaviconError(err);
  }
}

interface IconCandidate {
  href: string;
  /** apple-touch-icon (3) > icon (2) > shortcut icon (1). */
  priority: number;
  /** Largest dimension declared in `sizes`, 0 otherwise. */
  size: number;
}

/** Extracts `<link rel*="icon">` candidates from HTML, sorted from best to worst. Deliberately tolerant reading — we validate each candidate by
 a real fetch behind. */
function parseIconLinks(html: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  for (const tag of scanTags(html, "link")) {
    const attributes = parseAttributes(tag);
    const rel = attributes.get("rel")?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = attributes.get("href");
    if (!href) continue;
    const priority = rel.includes("apple-touch-icon") ? 3 : rel.includes("shortcut") ? 1 : 2;
    let size = 0;
    for (const match of (attributes.get("sizes") ?? "").matchAll(/(\d+)x\d+/gi)) {
      size = Math.max(size, Number(match[1]));
    }
    candidates.push({ href, priority, size });
  }
  return candidates.sort((a, b) => b.priority - a.priority || b.size - a.size);
}

/** Readable title of a page: `og:title` if it is there, otherwise `<title>`. */
function parsePageTitle(html: string): string | null {
  const raw = extractMetaContent(html, "og:title") ?? extractTitleText(html);
  if (raw == null) return null;
  const text = decodeBasicEntities(raw).replace(/\s+/g, " ").trim();
  return text || null;
}

/** The five entities that HTML imposes; the rest passes as is (a title is not rendered HTML, it ends up in a text node). */
function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

export interface ResolvedIcon {
  url: string;
  contentType: string;
  bytes: Buffer;
}

/** Downloads a candidate and validates it (MIME + size). null if unusable. */
async function tryFetchIcon(rawUrl: string): Promise<ResolvedIcon | null> {
  try {
    const response = await guardedFetch(rawUrl, MAX_ICON_BYTES);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (!iconExtFromContentType(contentType)) return null;
    if (response.bytes.byteLength === 0) return null;
    return { url: response.url.toString(), contentType: contentType as string, bytes: response.bytes };
  } catch {
    return null;
  }
}

/** What we know about a URL after a single pass on the page. */
export interface LinkPreview {
  /** L'URL finale, redirects suivis — celle qu'on enregistre. */
  url: string;
  /** `og:title` or `<title>` ; the hostname when the page does not give one. */
  title: string;
  /** The downloaded favicon, null if the site has none usable. */
  icon: ResolvedIcon | null;
}

/**
 * Reads a page once and extracts what describes a link: its title and
 * its favicon (`<link rel*="icon">`, apple-touch-icon > icon > shortcut,
 * separated by declared size, otherwise `/favicon.ico` at the origin).
 *
 * **Only raises on an unrecoverable URL** (`FaviconError("invalidUrl")`:
 * non-http(s) protocol, private IP, dead DNS). A site that is unreachable or without
 * favicon renders a partial preview — the hostname for title, `icon: null` —
 * because a link remains a valid link even if its site is turned off.
 */
export async function resolveLinkPreview(siteUrl: string): Promise<LinkPreview> {
  // Same completion as on the keyboard, and with the same code: `minddy_add_resource`
  // and Numo's `add_resource` tool arrive here WITHOUT having gone through the
  // dialog, and must accept “linear.app” as it.
  const normalized = withUrlScheme(siteUrl);

  let base: URL | null = null;
  let candidates: IconCandidate[] = [];
  let title: string | null = null;
  try {
    // A page that is too big is CUT, not thrown away: what we are looking for (`<head>`)
    // is in the lead, and a site that's a bit big doesn't have to lose its title.
    const response = await guardedFetch(normalized, MAX_HTML_BYTES, "truncate");
    base = response.url;
    if (response.ok) {
      const html = response.bytes.toString("utf8");
      candidates = parseIconLinks(html);
      title = parsePageTitle(html);
    }
  } catch (err) {
    // An invalid URL (protocol, private IP, DNS) is unrecoverable; a website
    // whoever doesn't respond keeps their chance via /favicon.ico.
    if (err instanceof FaviconError && err.key === "invalidUrl") throw err;
    try {
      base = (await assertPublicHttpUrl(normalized)).url;
    } catch {
      throw new FaviconError("invalidUrl");
    }
  }

  const url = (base ?? new URL(normalized)).toString();
  const hostname = (base ?? new URL(normalized)).hostname.replace(/^www\./, "");

  for (const candidate of candidates.slice(0, 5)) {
    let href: string;
    try {
      href = new URL(candidate.href, base ?? undefined).toString();
    } catch {
      continue;
    }
    const icon = await tryFetchIcon(href);
    if (icon) return { url, title: title ?? hostname, icon };
  }

  if (base) {
    const fallback = await tryFetchIcon(new URL("/favicon.ico", base).toString());
    if (fallback) return { url, title: title ?? hostname, icon: fallback };
  }
  return { url, title: title ?? hostname, icon: null };
}

/**
 * The favicon alone, for the icon of a project (MIN-62): same passage as
 * {@link resolveLinkPreview}, but the absence of favicon is an error here —
 * there is nothing to store. Raises FaviconError ("invalidUrl" if the URL is
 * unrecoverable, "notFound" if no usable favicon).
 */
export async function resolveFavicon(siteUrl: string): Promise<ResolvedIcon> {
  const { icon } = await resolveLinkPreview(siteUrl);
  if (!icon) throw new FaviconError("notFound");
  return icon;
}
