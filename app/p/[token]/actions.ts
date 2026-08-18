"use server";

import { redirect } from "next/navigation";
import {
  unlockShareWithPassword,
  type ShareUnlockError,
} from "@/lib/server/share-unlock";

/** PublicShare namespace key, rendered under the form. */
export type UnlockState = { error: ShareUnlockError } | null;

/**
 * Unlock a password-protected published page (MIN-283).
 *
 * Everything related to the secret is in `lib/server/share-unlock.ts`, shared
 * with the shared view: only the return path remains here. No
 * custom domain to spare — a published page responds to `/p/<token>` and
 * nowhere else (MIN-36 domains map a board or a view).
 */
export async function unlockPageShare(
  token: string,
  _prev: UnlockState,
  formData: FormData
): Promise<UnlockState> {
  const result = await unlockShareWithPassword({
    token,
    password: formData.get("password"),
    cookiePath: `/p/${token}`,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/p/${token}`);
}
