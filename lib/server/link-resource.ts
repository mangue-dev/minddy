import "server-only";

import sharp from "sharp";
import { resolveLinkPreview } from "@/lib/server/favicon";
import { MAX_ICON_DATA_URL_BYTES } from "@/lib/server/attachments";
import type { LinkResourceInput } from "@/lib/types";

/**
 * From a raw URL to the resource descriptor that we record (MIN-184):
 * page title for label, favicon reduced to an inline thumbnail.
 *
 * The favicon lives IN the row, in data URI — not in the bucket. This is what
 * keeps the four household chains (DELETE route, trash, retention,
 * account deletion) on a single object path. The price to pay is
 * that the icon must remain small: 32 px side in WebP, ~1-2 KB.
 *
 * Two exceptions to recompression, both dictated by libvips:
 * - a `.ico` cannot be read — checked on the linear.app favicon, a real one
 * ICO container with three frames that sharp refuses net. So we keep it RAW,
 * and it is he who decides the ceiling: 15 KB of ICO makes ~20 KB of base64,
 * hence `MAX_ICON_DATA_URL_BYTES` at 24 KB. Lowering the ceiling would not make
 * not these lighter icons, he would only make them disappear;
 * - an icon that sharp refuses (hidden SVG, truncated bytes) does not cancel the
 *    lien : on rend simplement `icon_data_url: null`.
 *
 * Only raises on an irretrievable URL (FaviconError("invalidUrl")). A website
 * turned off remains a valid link, with its hostname as the title.
 */

/** The badge of a resource displays the icon in 20 px CSS; ×1.6 for retina
    without making the line grow. */
const ICON_SIZE = 32;

export async function resolveLinkResource(
  rawUrl: string
): Promise<LinkResourceInput> {
  const preview = await resolveLinkPreview(rawUrl);
  return {
    kind: "link",
    url: preview.url,
    file_name: preview.title.slice(0, 200),
    icon_data_url: preview.icon ? await toIconDataUrl(preview.icon) : null,
  };
}

async function toIconDataUrl(icon: {
  contentType: string;
  bytes: Buffer;
}): Promise<string | null> {
  const mime = icon.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const isIco = mime.includes("icon") || mime === "image/ico";

  if (isIco) {
    const raw = dataUrl("image/x-icon", icon.bytes);
    return raw.length <= MAX_ICON_DATA_URL_BYTES ? raw : null;
  }

  try {
    const webp = await sharp(icon.bytes, { animated: false })
      .resize(ICON_SIZE, ICON_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer();
    const url = dataUrl("image/webp", webp);
    return url.length <= MAX_ICON_DATA_URL_BYTES ? url : null;
  } catch {
    return null;
  }
}

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
