/**
 * Images pasted into a forge comment (MIN-162) — why they don't
 * weren't going to minddy, and where they're going now.
 *
 * ## What really happens
 *
 * An image posted in a comment on github.com is written, in the body
 * markdown served by the API, `https://github.com/user-attachments/assets/<uuid>`.
 * This URL is NOT serviceable: measured against the real API (private repository
 * `mangue-dev/minddy-issues`, PR #30), she responds **404** to everything minddy
 * can present —
 *
 * | Who asks | Answer |
 * | --- | --- |
 * | anonymous (the `<img>` of the browser, without GitHub cross-site cookies) | 404 |
 * | GitHub App installation token (`ghs_`) | 404 |
 * | App user-to-server token (`ghu_`) | 404 |
 * | classic OAuth token with scope `repo` (`gho_`) | 302 → the image |
 *
 * — and minddy does not hold any `gho_`. The “proxy with token” track
 * from the initial framing therefore does not work: it would proxy a 404. (The
 * “authorized domains” track was already discarded: the rendering passes
 * by a raw `<img>` tag, no `next/image` allowlist occurs.)
 *
 * ## Where does it go
 *
 * GitHub knows how to render the comment itself: with
 * `Accept: application/vnd.github.full+json`, the response has a `body_html` where
 * each image is rewritten in
 * `private-user-images.githubusercontent.com/<id>/<n>-<uuid>.<ext>?jwt=<signature>`,
 * and **this URL is used without any authentication** (measured: 200,
 * image/png). It's the same rewrite for a public repository and for a repository
 * private — only one mechanic to know.
 *
 * The `jwt` only lives **300 seconds**. This is what prohibits sticking it in
 * the response `/comments` and leave it there: one panel remained open five
 * minutes would no longer display anything. Hence the detour via a minddy road
 * (`/api/pull-requests/[prId]/image?asset=<uuid>`), which requests a URL again
 * fresh every time you load an image.
 *
 * The `uuid` is the key for matching the two forms: it is present in the URL
 * public **and** in the file name of the signed URL. Nothing to correlate with
 * position.
 *
 * This module is pure on both sides: the client reads what needs to be rewritten, the
 * server what needs to be resolved.
 */

/**
 * The PUBLIC bucket where files attached to a PR comment land
 * (MIN-162). Public because the comment goes to the forge: its URL is
 * read by GitHub, by its notification emails, and by people who don't have
 * minddy account. Server writing only — cf. migration.
 */
export const FORGE_ATTACHMENTS_BUCKET = "forge-attachments";

/**
 * What a hosted file adds to the comment body. An image INSERTS
 * (she looks at herself in the wire, here as at the forge); everything else becomes
 * a named link — a `![](…)` on a PDF would only result in a broken icon.
 */
export function forgeAttachmentMarkdown(file: {
  url: string;
  name: string;
  isImage: boolean;
}): string {
  // Brackets in a file name would break the link syntax.
  const label = file.name.replace(/[[\]]/g, "");
  return file.isImage ? `![${label}](${file.url})` : `[${label}](${file.url})`;
}

/** `…/user-attachments/assets/<uuid>` — the form that arrives in the markdown. */
const PUBLIC_ASSET_RE =
  /^https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `…/<ownerId>/<n>-<uuid>.<ext>?jwt=…` — the signed form rendered by `body_html`. */
const SIGNED_ASSET_RE =
  /^https:\/\/private-user-images\.githubusercontent\.com\/\d+\/\d+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+/i;

/** The only host that the image route agrees to fetch (SSRF guard). */
export const SIGNED_ASSET_HOST = "private-user-images.githubusercontent.com";

/** An asset identifier as it arrives as a URL parameter. Constrained BEFORE
    any resolution: it serves as a search key, never as a path. */
export function isForgeAssetId(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

/** The uuid of a public asset URL, or null if it is not one. */
export function forgeAssetId(src: string): string | null {
  return PUBLIC_ASSET_RE.exec(src.trim())?.[1]?.toLowerCase() ?? null;
}

/** The uuid of a SIGNED URL, or null. The numeric prefix of the file name is
    the internal id of the upload — it is of no use to us, only the uuid matches. */
export function signedForgeAssetId(url: string): string | null {
  return SIGNED_ASSET_RE.exec(url.trim())?.[1]?.toLowerCase() ?? null;
}

/**
 * The image `src` of a `body_html`, indexed by asset uuid. A reading of
 * string rather than a parser: the answer comes from GitHub, we only keep
 * which matches `SIGNED_ASSET_RE` — so never an arbitrary URL.
 *
 * `&amp;`: HTML escapes query separators, URL must be unescaped
 * before being followed (the `jwt` depends on it).
 */
export function collectSignedAssets(
  htmls: Iterable<string | null | undefined>,
  into: Map<string, string> = new Map(),
): Map<string, string> {
  for (const html of htmls) {
    if (!html) continue;
    for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
      const url = match[1].replace(/&amp;/g, "&");
      const id = signedForgeAssetId(url);
      // First one wins: the same asset cited twice carries two equally valid
      // JWTs, so there is no reason to keep more than one.
      if (id && !into.has(id)) into.set(id, url);
    }
  }
  return into;
}

/**
 * The `src` to render for an image in a forge comment: minddy's route when it
 * is a GitHub asset, and the original URL otherwise (a CI badge or an image
 * hosted elsewhere — nothing to proxy, and the proxy could not resolve it).
 *
 * `endpoint` is the PR base (`/api/pull-requests/{id}`), which the rest of the
 * view already uses.
 */
export function forgeImageSrc(src: string | undefined, endpoint: string): string | undefined {
  if (!src) return src;
  const id = forgeAssetId(src);
  return id ? `${endpoint}/image?asset=${id}` : src;
}
