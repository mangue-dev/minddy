"use server";

import { redirect } from "next/navigation";
import {
  getRequestDomainTarget,
  shareBasePath,
} from "@/lib/server/custom-domains";
import {
  unlockShareWithPassword,
  type ShareUnlockError,
} from "@/lib/server/share-unlock";

/** Key into the PublicShare i18n namespace, rendered under the form. */
export type UnlockState = { error: ShareUnlockError } | null;

/**
 * Verify a password share's password and mark the visitor unlocked via an
 * httpOnly cookie scoped to this share's path. On success, redirects back to
 * the share page so the server re-renders it unlocked.
 *
 * Tout ce qui touche au secret vit dans `lib/server/share-unlock.ts`, partagé
 * avec la page publiée (MIN-283) : ici il ne reste que le chemin de retour,
 * qui est propre à cette route — et conscient du domaine personnalisé (MIN-36),
 * où le path visible est la racine.
 */
export async function unlockShare(
  token: string,
  _prev: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  const base = shareBasePath(token, await getRequestDomainTarget());
  const result = await unlockShareWithPassword({
    token,
    password: formData.get("password"),
    cookiePath: `/share/${token}`,
  });
  if (!result.ok) return { error: result.error };
  redirect(base || "/");
}
