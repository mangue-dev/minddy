import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getClientIp } from "@/lib/server/request-ip";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";
import {
  AvatarFileError,
  MAX_AVATAR_UPLOAD_BYTES,
  stageSignupAvatar,
} from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Stages an avatar image before an account exists.
 *
 * The returned opaque token is safe to place in auth metadata. It is claimed
 * and destroyed on the first authenticated arrival, including email-confirmed
 * signups that complete in another browser process.
 */
export async function POST(request: NextRequest) {
  const refused = rateLimitRefusal(`ip:${getClientIp(request)}`, "signup-avatar", {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (refused) return refused;

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
    const token = await stageSignupAvatar(
      getServiceClient(),
      Buffer.from(await file.arrayBuffer()),
    );
    return NextResponse.json({ token });
  } catch (error) {
    if (error instanceof AvatarFileError) {
      const key = error.key === "tooLarge" ? "avatarFileTooLarge" : "avatarInvalidFile";
      return NextResponse.json(
        { error: t(key) },
        { status: error.key === "tooLarge" ? 413 : 400 },
      );
    }
    console.error("[signup/avatar] staging failed:", error);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
