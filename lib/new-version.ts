/**
 * Detection of a more recent deployment than the one loaded in the
 tab * (MIN-157) — the pure part, without React or fetch, to be testable.
 *
 * Two SHAs face each other: that of BUILD, inlined in the bundle by
 * `next.config.mjs`, and the one returned by `/api/version`, which comes from the
 * deployment serving the request. If they differ, the tab runs code
 * which is no longer that of production.
 *
 * The refusal is memorized by SHA SERVER, not by a boolean: refusing a
 * version must not extinguish the next one.
 */

/** The SHA of THIS bundle. Empty locally, and if the Vercel
 system variables are unchecked — in both cases the detection remains silent. */
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ?? "";

/** localStorage key of the last SHA refused. Prefix `minddy.` like the
 queries cache (lib/query-provider.tsx). */
export const DISMISSED_VERSION_KEY = "minddy.dismissed-version";

/** The SHA refused, or null if the user has not closed anything (or no storage). */
export function readDismissedCommit(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISMISSED_VERSION_KEY) || null;
  } catch {
    // localStorage unavailable (strict private browsing) → no known denials.
    return null;
  }
}

/** Memorize the refused SHA so as not to reopen the banner on that one. */
export function writeDismissedCommit(commit: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_VERSION_KEY, commit);
  } catch {
    // Without storage, the banner will reappear: this is the safe behavior.
  }
}

export function shouldShowNewVersion({
  buildCommit,
  serverCommit,
  dismissedCommit,
}: {
  buildCommit: string;
  serverCommit: string | undefined;
  dismissedCommit: string | null;
}): boolean {
  // A missing SHA on one side or the other proves nothing: we keep silent.
  if (!buildCommit || !serverCommit) return false;
  if (buildCommit === serverCommit) return false;
  return serverCommit !== dismissedCommit;
}
