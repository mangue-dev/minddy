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
 * Everything secret lives in `lib/server/share-unlock.ts`, shared
 * with the published page (MIN-283): here only the return path remains,
 * which is specific to this route — and aware of the custom domain (MIN-36),
 * where the visible path is the root.
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
