"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getRequestDomainTarget,
  isCustomPublicHost,
  publicCookiePath,
  shareBasePath,
} from "@/lib/server/custom-domains";
import {
  SHARE_UNLOCK_COOKIE,
  getPublicShareByToken,
  unlockCookieValue,
  verifySharePassword,
} from "@/lib/server/view-shares";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/** Key into the PublicShare i18n namespace, rendered under the form. */
export type UnlockState = { error: "wrongPassword" | "tooManyAttempts" } | null;

/** Verify a password share's password and mark the visitor unlocked via an
    httpOnly cookie scoped to this share's path. On success, redirects back to
    the share page so the server re-renders it unlocked. */
export async function unlockShare(
  token: string,
  _prev: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  // Anonymous endpoint — rate-limit per visitor IP (Vercel sets x-forwarded-for).
  const forwarded = (await headers()).get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const { allowed } = checkSessionRateLimit(ip, `share-unlock:${token}`, {
    limit: 10,
  });
  if (!allowed) return { error: "tooManyAttempts" };

  // Sur domaine personnalisé (MIN-36), le path visible est la racine : les
  // redirects et le path du cookie doivent suivre le host courant.
  const base = shareBasePath(token, await getRequestDomainTarget());
  const ctx = await getPublicShareByToken(token);
  if (!ctx) return { error: "wrongPassword" };
  const { share } = ctx;
  // Share turned public meanwhile — nothing to unlock, just re-render.
  if (share.level !== "password" || !share.password_salt || !share.password_hash) {
    redirect(base || "/");
  }

  // Borne avant scrypt (MIN-118) : un mot de passe non borné est un puits CPU,
  // même sous le rate limit ci-dessus. Aligné sur la route PUT du partage
  // (MAX_PASSWORD_LENGTH = 256). Au-delà, inutile de dériver : c'est faux.
  const password = formData.get("password");
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !verifySharePassword(password, share.password_salt, share.password_hash)
  ) {
    return { error: "wrongPassword" };
  }

  (await cookies()).set(
    SHARE_UNLOCK_COOKIE,
    unlockCookieValue(share.token, share.password_hash),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Path-scoped so one cookie name serves any number of shares. Sur
      // domaine personnalisé, la racine (la valeur reste liée à CE share).
      path: publicCookiePath(await isCustomPublicHost(), `/share/${share.token}`),
      maxAge: 7 * 24 * 3600,
    }
  );
  redirect(base || "/");
}
