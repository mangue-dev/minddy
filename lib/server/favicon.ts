import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Résolution du favicon d'un site live (MIN-62), portée du pattern AutoKap
 * (favicon-resolver.ts + refetch-icon). Le stockage de l'icône côté projet vit
 * à côté, dans [project-icon.ts](./project-icon.ts) — ici on ne fait que
 * trouver et télécharger l'image.
 *
 * Le serveur fetch une URL fournie par l'utilisateur : tout passe par
 * `guardedFetch`, qui n'accepte que http(s) vers des IP publiques (résolution
 * DNS vérifiée à chaque hop de redirect), avec timeout et plafond de taille.
 */

const MAX_ICON_BYTES = 512 * 1024; // 512 Ko
const MAX_HTML_BYTES = 1024 * 1024; // 1 Mo — on ne lit le HTML que pour le <head>
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

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

export function iconExtFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ICON_MIME_EXT[mime] ?? null;
}

/** IPv4/IPv6 privées, loopback, link-local, CGNAT… — tout ce qui n'est pas
    routable publiquement est refusé (anti-SSRF). */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9")) return true; // link-local
  if (lower.startsWith("fea") || lower.startsWith("feb")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return false;
}

/** Valide protocole + résolution DNS publique d'une URL. Lève FaviconError. */
async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FaviconError("invalidUrl");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FaviconError("invalidUrl");
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new FaviconError("invalidUrl");
    return url;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new FaviconError("invalidUrl");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new FaviconError("invalidUrl");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new FaviconError("invalidUrl");
  }
  return url;
}

/**
 * fetch guardé : chaque hop (URL initiale + redirects, max 3) est revalidé
 * contre `assertPublicHttpUrl`; timeout global. Renvoie la réponse finale et
 * l'URL finale (base de résolution des href relatifs).
 */
async function guardedFetch(rawUrl: string): Promise<{ response: Response; finalUrl: URL }> {
  let current = await assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "minddy-favicon/1.0 (+https://www.minddy.app)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) throw new FaviconError("notFound");
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new FaviconError("notFound");
}

/** Lit un corps de réponse avec plafond de taille (content-length menteur inclus). */
async function readCapped(response: Response, cap: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) throw new FaviconError("notFound");
  const reader = response.body?.getReader();
  if (!reader) throw new FaviconError("notFound");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      void reader.cancel();
      throw new FaviconError("notFound");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

interface IconCandidate {
  href: string;
  /** apple-touch-icon (3) > icon (2) > shortcut icon (1). */
  priority: number;
  /** Plus grande dimension déclarée dans `sizes`, 0 sinon. */
  size: number;
}

/** Extrait les candidats `<link rel*="icon">` du HTML, triés du meilleur au
    moins bon. Regex volontairement tolérante — on valide chaque candidat par
    un vrai fetch derrière. */
function parseIconLinks(html: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  for (const [tag] of html.matchAll(linkRe)) {
    const attr = (name: string): string | null => {
      const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
      return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
    };
    const rel = attr("rel")?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = attr("href");
    if (!href) continue;
    const priority = rel.includes("apple-touch-icon") ? 3 : rel.includes("shortcut") ? 1 : 2;
    const sizes = attr("sizes") ?? "";
    const size = Math.max(
      0,
      ...[...sizes.matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1]))
    );
    candidates.push({ href, priority, size });
  }
  return candidates.sort((a, b) => b.priority - a.priority || b.size - a.size);
}

/** Titre lisible d'une page : `og:title` s'il est là, sinon `<title>`. */
function parsePageTitle(html: string): string | null {
  const og = html.match(
    /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i
  )?.[0];
  const ogContent = og?.match(
    /content\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i
  );
  const raw =
    ogContent?.[2] ??
    ogContent?.[3] ??
    ogContent?.[4] ??
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;
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
    const { response, finalUrl } = await guardedFetch(rawUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (!iconExtFromContentType(contentType)) return null;
    const bytes = await readCapped(response, MAX_ICON_BYTES);
    if (bytes.byteLength === 0) return null;
    return { url: finalUrl.toString(), contentType: contentType as string, bytes };
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
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(siteUrl.trim())
    ? siteUrl.trim()
    : `https://${siteUrl.trim()}`;

  let base: URL | null = null;
  let candidates: IconCandidate[] = [];
  let title: string | null = null;
  try {
    const { response, finalUrl } = await guardedFetch(normalized);
    base = finalUrl;
    if (response.ok) {
      const html = (await readCapped(response, MAX_HTML_BYTES)).toString("utf8");
      candidates = parseIconLinks(html);
      title = parsePageTitle(html);
    }
  } catch (err) {
    // Une URL invalide (protocole, IP privée, DNS) est irrécupérable ; un site
    // qui ne répond pas garde sa chance via /favicon.ico.
    if (err instanceof FaviconError && err.key === "invalidUrl") throw err;
    try {
      base = await assertPublicHttpUrl(normalized);
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
