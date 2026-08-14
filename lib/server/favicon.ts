import "server-only";

import { extractMetaContent, extractTitleText, parseAttributes, scanTags } from "@/lib/server/html-meta";
import { SafeFetchError, assertPublicHttpUrl, safeFetch } from "@/lib/server/safe-fetch";
import { withUrlScheme } from "@/lib/url-normalize";

/**
 * Résolution du favicon d'un site live (MIN-62), portée du pattern AutoKap
 * (favicon-resolver.ts + refetch-icon). Le stockage de l'icône côté projet vit
 * à côté, dans [project-icon.ts](./project-icon.ts) — ici on ne fait que
 * trouver et télécharger l'image.
 *
 * Le serveur fetch une URL fournie par l'utilisateur : tout passe par
 * [safe-fetch.ts](./safe-fetch.ts), qui n'accepte que http(s) vers des IP
 * publiques, **se connecte à l'adresse qu'il a validée** (anti-rebinding),
 * revalide chaque redirection, et borne délai et octets lus. Et le HTML
 * rapporté est analysé par [html-meta.ts](./html-meta.ts), dont chaque fonction
 * est linéaire — une page hostile coûte le prix de sa taille, pas plus.
 */

const MAX_ICON_BYTES = 512 * 1024; // 512 Ko
const MAX_HTML_BYTES = 1024 * 1024; // 1 Mo — on ne lit le HTML que pour le <head>
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "minddy-favicon/1.0 (+https://www.minddy.app)";

/** MIME acceptés → extension stockée. Pas de SVG (script-capable). */
export const ICON_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/ico": "ico",
};

/** Erreur typée pour que la route réponde avec la bonne clé ApiErrors. */
export class FaviconError extends Error {
  constructor(public readonly key: "invalidUrl" | "notFound") {
    super(key);
  }
}

/** Une URL irrécupérable reste irrécupérable ; tout le reste (site éteint,
    corps démesuré, redirection sans fin) n'est qu'une absence de favicon. */
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

/** fetch guardé : protocole, IP publique épinglée, redirections revalidées,
    plafond d'octets et délai global. */
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
  /** Plus grande dimension déclarée dans `sizes`, 0 sinon. */
  size: number;
}

/** Extrait les candidats `<link rel*="icon">` du HTML, triés du meilleur au
    moins bon. Lecture volontairement tolérante — on valide chaque candidat par
    un vrai fetch derrière. */
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

/** Titre lisible d'une page : `og:title` s'il est là, sinon `<title>`. */
function parsePageTitle(html: string): string | null {
  const raw = extractMetaContent(html, "og:title") ?? extractTitleText(html);
  if (raw == null) return null;
  const text = decodeBasicEntities(raw).replace(/\s+/g, " ").trim();
  return text || null;
}

/** Les cinq entités que HTML impose ; le reste passe tel quel (un titre n'est
    pas du HTML rendu, il finit dans un nœud texte). */
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

/** Télécharge un candidat et le valide (MIME + taille). null si inutilisable. */
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

/** Ce qu'on sait dire d'une URL après un seul passage sur la page. */
export interface LinkPreview {
  /** L'URL finale, redirects suivis — celle qu'on enregistre. */
  url: string;
  /** `og:title` ou `<title>` ; le hostname quand la page n'en donne pas. */
  title: string;
  /** Le favicon téléchargé, null si le site n'en a aucun d'exploitable. */
  icon: ResolvedIcon | null;
}

/**
 * Lit une page une seule fois et en tire ce qui décrit un lien : son titre et
 * son favicon (`<link rel*="icon">`, apple-touch-icon > icon > shortcut,
 * départagés par taille déclarée, sinon `/favicon.ico` à l'origine).
 *
 * **Ne lève que sur une URL irrécupérable** (`FaviconError("invalidUrl")` :
 * protocole non http(s), IP privée, DNS mort). Un site injoignable ou sans
 * favicon rend un aperçu partiel — le hostname pour titre, `icon: null` —
 * parce qu'un lien reste un lien valide même si son site est éteint.
 */
export async function resolveLinkPreview(siteUrl: string): Promise<LinkPreview> {
  // Même complétion qu'au clavier, et par le même code : `minddy_add_resource`
  // et le tool `add_resource` de Numo arrivent ici SANS être passés par le
  // dialog, et doivent accepter « linear.app » comme lui.
  const normalized = withUrlScheme(siteUrl);

  let base: URL | null = null;
  let candidates: IconCandidate[] = [];
  let title: string | null = null;
  try {
    // Une page trop grosse est COUPÉE, pas jetée : ce qu'on cherche (`<head>`)
    // est en tête, et un site un peu gros n'a pas à perdre son titre.
    const response = await guardedFetch(normalized, MAX_HTML_BYTES, "truncate");
    base = response.url;
    if (response.ok) {
      const html = response.bytes.toString("utf8");
      candidates = parseIconLinks(html);
      title = parsePageTitle(html);
    }
  } catch (err) {
    // Une URL invalide (protocole, IP privée, DNS) est irrécupérable ; un site
    // qui ne répond pas garde sa chance via /favicon.ico.
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
 * Le favicon seul, pour l'icône d'un projet (MIN-62) : même passage que
 * {@link resolveLinkPreview}, mais l'absence de favicon est ici une erreur —
 * il n'y a rien à stocker. Lève FaviconError ("invalidUrl" si l'URL est
 * irrécupérable, "notFound" si aucun favicon exploitable).
 */
export async function resolveFavicon(siteUrl: string): Promise<ResolvedIcon> {
  const { icon } = await resolveLinkPreview(siteUrl);
  if (!icon) throw new FaviconError("notFound");
  return icon;
}
