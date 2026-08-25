import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  AvatarFileError,
  claimAvatarSeed,
  claimPendingAvatar,
  clearAvatarUploadToken,
  fetchAvatarSeed,
  MAX_AVATAR_UPLOAD_BYTES,
  regenerateAvatarSeed,
  uploadAvatarImage,
} from "@/lib/server/avatar-seeds";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import { getServiceClient } from "@/lib/supabase-service";

/** Returns the current account avatar source used by every shared renderer. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const avatar = await fetchAvatarSeed(getServiceClient(), auth.user.id);
  return NextResponse.json({ avatar });
}

/**
 * Changes the current account avatar.
 *
 * - multipart `file`: normalize and use an imported image;
 * - JSON `{ avatar_upload_token }`: claim the image staged during signup;
 * - JSON `{ seed }`: adopt the Lorelei choice made during signup;
 * - an empty POST: replace any current source with a new Lorelei draw.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const refused = rateLimitRefusal(auth.user.id, "avatar-write", { limit: 20 });
  if (refused) return refused;

  const service = getServiceClient();
  const clearSignupToken = async () => {
    try {
      await clearAvatarUploadToken(
        service,
        auth.user.id,
        auth.user.user_metadata as Record<string, unknown>,
      );
    } catch (error) {
      console.error("[me/avatar] signup token cleanup failed:", error);
    }
  };
  const isUpload = (request.headers.get("content-type") ?? "").includes(
    "multipart/form-data",
  );

  if (isUpload) {
    const t = await getTranslations("ApiErrors");
    let file: unknown;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return NextResponse.json({ error: t("avatarInvalidFile") }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: t("avatarInvalidFile") }, { status: 400 });
    }
    if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
      return NextResponse.json({ error: t("avatarFileTooLarge") }, { status: 413 });
    }
    try {
      const avatar = await uploadAvatarImage(
        service,
        auth.user.id,
        Buffer.from(await file.arrayBuffer()),
      );
      await clearSignupToken();
      return NextResponse.json({ avatar });
    } catch (error) {
      if (error instanceof AvatarFileError) {
        const key = error.key === "tooLarge" ? "avatarFileTooLarge" : "avatarInvalidFile";
        return NextResponse.json(
          { error: t(key) },
          { status: error.key === "tooLarge" ? 413 : 400 },
        );
      }
      console.error("[me/avatar] upload failed:", error);
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
    }
  }

  const body = (await request.json().catch(() => null)) as {
    avatar_upload_token?: unknown;
    seed?: unknown;
  } | null;
  const token =
    typeof body?.avatar_upload_token === "string" ? body.avatar_upload_token : null;
  const seed = typeof body?.seed === "string" ? body.seed : null;

  try {
    if (token) {
      await claimPendingAvatar(service, auth.user.id, token);
      await clearSignupToken();
      return NextResponse.json({
        avatar: await fetchAvatarSeed(service, auth.user.id),
      });
    }
    if (seed) {
      await claimAvatarSeed(service, auth.user.id, seed);
      await clearSignupToken();
      return NextResponse.json({
        avatar: await fetchAvatarSeed(service, auth.user.id),
      });
    }
    const avatar = await regenerateAvatarSeed(service, auth.user.id);
    await clearSignupToken();
    return NextResponse.json({ avatar });
  } catch (error) {
    console.error("[me/avatar] change failed:", error);
    return NextResponse.json({ error: "Avatar change failed" }, { status: 500 });
  }
}
