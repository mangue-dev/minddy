import "server-only";

import sharp from "sharp";
import { getServiceClient } from "@/lib/supabase-service";
import {
  ICON_MIME_EXT,
  iconExtFromContentType,
  resolveFavicon,
} from "@/lib/server/favicon";

/**
 * The stored icon of a project (MIN-62): the file lives in the public bucket
 * `project-icons`, one entry per project, and its URL is placed on
 * `projects.icon_url`. Two sources, one location:
 *
 * - the live site favicon, downloaded as is ([favicon.ts](./favicon.ts));
 * - an image sent by the user, recompressed here.
 *
 * The upload accepts any weight: it is the server which brings the image to
 * 256 px side in WebP — a few tens of KB, often less — and not
 * the user who must prepare his file. `MAX_ICON_UPLOAD_BYTES` is not
 * a product rule but a memory safeguard: the entire request is
 * buffered before reaching libvips.
 *
 * The remote favicon is NOT recompressed: the `.ico` are the most common
 * format on the web and libvips cannot read them. They are already tiny.
 */

/** Memory guardrail, not a framing constraint. */
export const MAX_ICON_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 Mo

/** Max rendering side (64 px in the wizard) × 4: beyond that, the screen shows nothing more. */
const ICON_SIZE = 256;

/** Render vector (SVG) inputs before reduction — 96 dpi × ~3. */
const VECTOR_DENSITY = 300;

const BUCKET = "project-icons";

/** Typed error so that the route responds with the correct ApiErrors key. */
export class IconFileError extends Error {
  constructor(public readonly key: "invalidFile" | "tooLarge") {
    super(key);
  }
}

/**
 * Reduces any image readable by libvips (PNG, JPEG, WebP, GIF,
 * AVIF, TIFF, HEIC, SVG…) to a WebP square of at most 256 px.
 *
 * `contain` on a transparent background rather than `cover`: a logo is not a
 * photo, we prefer margins to cropping. Square, because the tile that
 * displays it is (`object-cover` in `ProjectOrb`) — a 256 × 192
 * output would get cropped there, which is precisely what `contain` was trying to avoid.
 *
 * Hence the side calculated on the input dimensions rather than fixed at 256:
 * `withoutEnlargement` only prevents the enlargement of the CONTENT, not the
 * production of the requested canvas — a 48 px icon arrived there whole but
 * lost in the center of a square six times too large.
 *
 * `rotate()` without argument applies the EXIF orientation, otherwise a photo
 * taken on the phone arrives lying down. We do not trust either the extension nor
 * the declared MIME type: it is libvips which decides on the bytes, and what it
 * cannot read is refused.
 */
export async function compressIconFile(bytes: Buffer): Promise<Buffer> {
  if (bytes.byteLength === 0) throw new IconFileError("invalidFile");
  if (bytes.byteLength > MAX_ICON_UPLOAD_BYTES) throw new IconFileError("tooLarge");
  try {
    const image = sharp(bytes, { animated: false, density: VECTOR_DENSITY });
    const { width, height } = await image.metadata();
    if (!width || !height) throw new IconFileError("invalidFile");
    const side = Math.min(ICON_SIZE, Math.max(width, height));

    return await image
      .rotate()
      .resize(side, side, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new IconFileError("invalidFile");
  }
}

/**
 * Set bytes already ready as project icon: upsert in
 * `project-icons/{projectId}.{ext}`, update of `projects.icon_url` (public URL
 * + cache-buster). Returns the stored URL.
 */
async function storeProjectIcon(
  projectId: string,
  bytes: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const path = `${projectId}.${ext}`;
  const service = getServiceClient();

  await removeProjectIconObjects(projectId); // only one extension at a time
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = service.storage.from(BUCKET).getPublicUrl(path);
  const iconUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await service
    .from("projects")
    .update({ icon_url: iconUrl })
    .eq("id", projectId);
  if (updateError) throw new Error(updateError.message);

  return iconUrl;
}

/**
 * Imports the favicon of `siteUrl` as the project icon. The caller has already verified that the user is the owner of the project.
 */
export async function importProjectIcon(
  projectId: string,
  siteUrl: string
): Promise<string> {
  const icon = await resolveFavicon(siteUrl);
  const ext = iconExtFromContentType(icon.contentType) as string;
  return storeProjectIcon(
    projectId,
    icon.bytes,
    icon.contentType.split(";")[0].trim(),
    ext
  );
}

/** Sets a file sent by the user as the project icon (owner). */
export async function uploadProjectIcon(
  projectId: string,
  bytes: Buffer
): Promise<string> {
  const webp = await compressIconFile(bytes);
  return storeProjectIcon(projectId, webp, "image/webp", "webp");
}

/** Removes possible storage objects from the icon (all extensions). */
async function removeProjectIconObjects(projectId: string): Promise<void> {
  const service = getServiceClient();
  const exts = [...new Set([...Object.values(ICON_MIME_EXT), "webp"])];
  await service.storage
    .from(BUCKET)
    .remove(exts.map((ext) => `${projectId}.${ext}`));
}

/** Clears the project icon (column + storage objects). */
export async function clearProjectIcon(projectId: string): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("projects")
    .update({ icon_url: null })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  await removeProjectIconObjects(projectId);
}
