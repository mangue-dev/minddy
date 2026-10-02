import "server-only";

import sharp from "sharp";
import { getServiceClient } from "@/lib/supabase-service";
import { projectIconPaths } from "./project-storage";
import { downloadProtectedProjectIcon, projectIconRoute,
  removeProtectedProjectIcon, shouldProtectProjectIcons,
  uploadProtectedProjectIcon } from "./project-icon-content";
import {
  ICON_MIME_EXT,
  iconExtFromContentType,
  resolveFavicon,
} from "@/lib/server/favicon";

/**
 * A project icon is either a legacy public object or a project-key encrypted
 * object in the private `project-icons` bucket. The row points to an immutable
 * opaque path and an authorization-gated application URL.
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
 * The remote favicon is not recompressed: `.ico` is a common
 * format on the web and libvips cannot read them. They are already tiny.
 */

/** Memory guardrail, not a framing constraint. */
export const MAX_ICON_UPLOAD_BYTES = 25 * 1024 * 1024;

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
 * Store a ready icon with a CAS row swap. New protected objects are verified
 * before publication and the former object is deleted only after the swap.
 */
export async function storeProjectIcon(
  projectId: string,
  bytes: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  if (!ICON_MIME_EXT[contentType] || bytes.length === 0 ||
      bytes.length > MAX_ICON_UPLOAD_BYTES) {
    throw new IconFileError("invalidFile");
  }
  const service = getServiceClient();
  if (await shouldProtectProjectIcons(service)) {
    const path = await uploadProtectedProjectIcon(service, projectId, bytes,
      contentType);
    const iconUrl = projectIconRoute(projectId);
    try {
      const { data: prior, error } = await service.from("projects")
        .select("icon_url,icon_storage_path").eq("id", projectId).single();
      if (error || !prior) throw new Error("Project icon row is unavailable");
      const swap = await service.rpc("replace_project_icon", {
        p_id: projectId, p_old_url: prior.icon_url,
        p_old_path: prior.icon_storage_path,
        p_new_url: iconUrl, p_new_path: path,
      });
      if (swap.error || !swap.data) {
        throw new Error("Project icon changed concurrently");
      }
      if (prior.icon_storage_path) {
        await removeProtectedProjectIcon(service, prior.icon_storage_path);
      } else {
        await removeLegacyProjectIconObjects(projectId);
      }
      return iconUrl;
    } catch (error) {
      const { data } = await service.from("projects")
        .select("icon_storage_path").eq("id", projectId).maybeSingle();
      if (data?.icon_storage_path !== path) {
        await removeProtectedProjectIcon(service, path);
      }
      throw error;
    }
  }

  const path = `${projectId}.${ext}`;

  await removeLegacyProjectIconObjects(projectId);
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
async function removeLegacyProjectIconObjects(projectId: string): Promise<void> {
  const service = getServiceClient();
  const paths = (await projectIconPaths(service, [projectId]))
    .filter((path) => path.startsWith(`${projectId}.`));
  if (paths.length > 0) {
    const removed = await service.storage.from(BUCKET).remove(paths);
    if (removed.error) throw new Error("Unable to remove legacy project icon");
  }
}

/** Clears the project icon (column + storage objects). */
export async function clearProjectIcon(projectId: string): Promise<void> {
  const service = getServiceClient();
  const { data: prior, error } = await service.from("projects")
    .select("icon_url,icon_storage_path").eq("id", projectId).single();
  if (error || !prior) throw new Error("Project icon row is unavailable");
  const swap = await service.rpc("replace_project_icon", {
    p_id: projectId, p_old_url: prior.icon_url,
    p_old_path: prior.icon_storage_path,
    p_new_url: null, p_new_path: null,
  });
  if (swap.error || !swap.data) throw new Error("Project icon changed concurrently");
  if (prior.icon_storage_path) {
    await removeProtectedProjectIcon(service, prior.icon_storage_path);
  } else {
    await removeLegacyProjectIconObjects(projectId);
  }
}

/** Return original bytes after the caller has authorized the project. */
export async function downloadProjectIcon(projectId: string): Promise<{
  bytes: Buffer; mimeType: string;
} | null> {
  const service = getServiceClient();
  const { data, error } = await service.from("projects")
    .select("icon_url,icon_storage_path").eq("id", projectId).maybeSingle();
  if (error) throw new Error("Unable to read project icon reference");
  if (!data?.icon_url) return null;
  if (data.icon_storage_path) {
    return downloadProtectedProjectIcon(service, projectId,
      data.icon_storage_path);
  }
  const path = (await projectIconPaths(service, [projectId]))
    .find((candidate) => candidate.startsWith(`${projectId}.`));
  if (!path) return null;
  const source = await service.storage.from(BUCKET).download(path);
  if (source.error || !source.data) throw new Error("Unable to download legacy project icon");
  return { bytes: Buffer.from(await source.data.arrayBuffer()),
    mimeType: source.data.type || "image/webp" };
}
