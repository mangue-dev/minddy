import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  uploadedAvatarSource,
  USER_AVATAR_BUCKET,
} from "@/lib/avatar-source";

/** Memory guardrail for an uploaded source image. */
export const MAX_AVATAR_UPLOAD_BYTES = 10 * 1024 * 1024;

const AVATAR_SIZE = 256;
const PENDING_AVATAR_TTL_MS = 24 * 60 * 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AvatarRow = {
  user_id: string;
  seed: string;
  image_path: string | null;
  updated_at: string;
};

/** Typed validation error so API routes can choose the correct response. */
export class AvatarFileError extends Error {
  constructor(public readonly key: "invalidFile" | "tooLarge") {
    super(key);
  }
}

/**
 * Normalizes a user image to a square WebP avatar.
 *
 * The server reads the bytes rather than trusting the filename or declared MIME
 * type. EXIF orientation is applied before the image is center-cropped, and the
 * stored result is bounded to keep every avatar response small and predictable.
 */
export async function compressAvatarFile(bytes: Buffer): Promise<Buffer> {
  if (bytes.byteLength === 0) throw new AvatarFileError("invalidFile");
  if (bytes.byteLength > MAX_AVATAR_UPLOAD_BYTES) {
    throw new AvatarFileError("tooLarge");
  }
  try {
    const image = sharp(bytes, { animated: false });
    const { width, height } = await image.metadata();
    if (!width || !height) throw new AvatarFileError("invalidFile");
    return await image
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 84 })
      .toBuffer();
  } catch (error) {
    if (error instanceof AvatarFileError) throw error;
    throw new AvatarFileError("invalidFile");
  }
}

function storedAvatarPath(userId: string): string {
  return `users/${userId}.webp`;
}

function pendingAvatarPath(token: string): string {
  return `pending/${token}.webp`;
}

/** Opportunistically removes staged images abandoned more than a day ago. */
async function cleanupExpiredPendingAvatars(service: SupabaseClient): Promise<void> {
  const cutoff = Date.now() - PENDING_AVATAR_TTL_MS;
  const { data, error } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .list("pending", {
      limit: 100,
      sortBy: { column: "created_at", order: "asc" },
    });
  if (error) return;
  const expired = (data ?? [])
    .filter((file) => {
      const createdAt = Date.parse(file.created_at ?? "");
      return !Number.isNaN(createdAt) && createdAt < cutoff;
    })
    .map((file) => `pending/${file.name}`);
  if (expired.length > 0) {
    await service.storage.from(USER_AVATAR_BUCKET).remove(expired);
  }
}

function sourceForRow(row: AvatarRow): string {
  if (!row.image_path) return row.seed;
  const version = encodeURIComponent(row.updated_at);
  return uploadedAvatarSource(`/api/avatars/${row.user_id}?v=${version}`);
}

/**
 * Resolves the render source of a batch of accounts and creates missing rows.
 *
 * The returned string remains compatible with the historic `avatar_seed`
 * fields carried by member, inbox, public-share, and activity payloads. A
 * Lorelei avatar is represented by its seed; an imported avatar uses the
 * explicit `uploaded:` source understood by the shared `UserAvatar` renderer.
 * Keeping this compatibility layer means every existing avatar surface follows
 * a profile change without gaining its own upload-specific branch.
 */
export async function fetchAvatarSeeds(
  service: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const sources = new Map<string, string>();
  if (unique.length === 0) return sources;

  const { data } = await service
    .from("user_avatars")
    .select("user_id, seed, image_path, updated_at")
    .in("user_id", unique);
  for (const value of data ?? []) {
    const row = value as AvatarRow;
    sources.set(row.user_id, sourceForRow(row));
  }

  const missing = unique.filter((id) => !sources.has(id));
  if (missing.length > 0) {
    const { data: created } = await service
      .from("user_avatars")
      .upsert(
        missing.map((user_id) => ({ user_id })),
        { onConflict: "user_id", ignoreDuplicates: true },
      )
      .select("user_id, seed, image_path, updated_at");
    for (const value of created ?? []) {
      const row = value as AvatarRow;
      sources.set(row.user_id, sourceForRow(row));
    }

    // An ignored duplicate is omitted from the upsert response. Reread rows
    // created by a concurrent request before applying the stable fallback.
    const stillMissing = missing.filter((id) => !sources.has(id));
    if (stillMissing.length > 0) {
      const { data: reread } = await service
        .from("user_avatars")
        .select("user_id, seed, image_path, updated_at")
        .in("user_id", stillMissing);
      for (const value of reread ?? []) {
        const row = value as AvatarRow;
        sources.set(row.user_id, sourceForRow(row));
      }
      for (const id of stillMissing) {
        if (!sources.has(id)) sources.set(id, id);
      }
    }
  }

  return sources;
}

/**
 * Returns an account avatar source without creating a row.
 *
 * This is used when the caller does not yet know whether an external UUID is a
 * Minddy account. A matching `user_avatars` row proves that identity; creating
 * a row here would manufacture that proof for foreign identifiers.
 */
export async function findAvatarSeed(
  service: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId || !UUID_RE.test(userId)) return null;
  const { data } = await service
    .from("user_avatars")
    .select("user_id, seed, image_path, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? sourceForRow(data as AvatarRow) : null;
}

/** Returns one account avatar source with the same guarantees as the batch. */
export async function fetchAvatarSeed(
  service: SupabaseClient,
  userId: string,
): Promise<string> {
  const sources = await fetchAvatarSeeds(service, [userId]);
  return sources.get(userId) ?? userId;
}

/**
 * Adopts the Lorelei seed selected before signup, without replacing an avatar
 * that already exists. Replaying auth arrival therefore cannot undo a later
 * profile change.
 */
export async function claimAvatarSeed(
  service: SupabaseClient,
  userId: string,
  seed: string | null | undefined,
): Promise<boolean> {
  if (!userId || !seed || !UUID_RE.test(seed)) return false;
  const { data, error } = await service
    .from("user_avatars")
    .upsert(
      { user_id: userId, seed },
      { onConflict: "user_id", ignoreDuplicates: true },
    )
    .select("seed");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/** Stores a normalized image directly as an authenticated user's avatar. */
export async function uploadAvatarImage(
  service: SupabaseClient,
  userId: string,
  bytes: Buffer,
): Promise<string> {
  const webp = await compressAvatarFile(bytes);
  const imagePath = storedAvatarPath(userId);
  const { error: uploadError } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .upload(imagePath, webp, { contentType: "image/webp", upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const updatedAt = new Date().toISOString();
  const { data, error } = await service
    .from("user_avatars")
    .upsert(
      { user_id: userId, image_path: imagePath, updated_at: updatedAt },
      { onConflict: "user_id" },
    )
    .select("user_id, seed, image_path, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return sourceForRow(data as AvatarRow);
}

/**
 * Stores a pre-authenticated signup image under an opaque, single-use token.
 * Only that token enters auth metadata; image bytes never inflate a session JWT.
 */
export async function stageSignupAvatar(
  service: SupabaseClient,
  bytes: Buffer,
): Promise<string> {
  const webp = await compressAvatarFile(bytes);
  await cleanupExpiredPendingAvatars(service);
  const token = crypto.randomUUID();
  const { error } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .upload(pendingAvatarPath(token), webp, {
      contentType: "image/webp",
      upsert: false,
    });
  if (error) throw new Error(error.message);
  return token;
}

/**
 * Claims a staged signup image for an authenticated account.
 *
 * Removing the pending object makes the token single-use. A replay on a later
 * login becomes a no-op, so it cannot restore the signup image after the user
 * has selected a different avatar in profile settings.
 */
export async function claimPendingAvatar(
  service: SupabaseClient,
  userId: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!userId || !token || !UUID_RE.test(token)) return false;
  const pendingPath = pendingAvatarPath(token);
  const { data: pending, error: downloadError } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .download(pendingPath);
  if (downloadError || !pending) return false;

  const imagePath = storedAvatarPath(userId);
  const bytes = Buffer.from(await pending.arrayBuffer());
  const { error: uploadError } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .upload(imagePath, bytes, { contentType: "image/webp", upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await service.from("user_avatars").upsert(
    {
      user_id: userId,
      image_path: imagePath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  await service.storage.from(USER_AVATAR_BUCKET).remove([pendingPath]);
  return true;
}

/** Removes the single-use signup token from auth metadata after it is consumed. */
export async function clearAvatarUploadToken(
  service: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!metadata || !("avatar_upload_token" in metadata)) return;
  const next = { ...metadata };
  delete next.avatar_upload_token;
  const { error } = await service.auth.admin.updateUserById(userId, {
    user_metadata: next,
  });
  if (error) throw new Error(error.message);
}

/** Switches the account back to a newly generated Lorelei avatar. */
export async function regenerateAvatarSeed(
  service: SupabaseClient,
  userId: string,
): Promise<string> {
  const seed = crypto.randomUUID();
  const { data, error } = await service
    .from("user_avatars")
    .upsert(
      {
        user_id: userId,
        seed,
        image_path: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("seed")
    .single();
  if (error) throw new Error(error.message);

  // The database already points at Lorelei, so an object cleanup failure must
  // not make the successful profile change appear to have failed.
  const { error: removeError } = await service.storage
    .from(USER_AVATAR_BUCKET)
    .remove([storedAvatarPath(userId)]);
  if (removeError) {
    console.error("[avatar] stale image cleanup failed:", removeError.message);
  }
  return data.seed as string;
}
