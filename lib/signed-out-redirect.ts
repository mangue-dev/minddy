import { isProtectedPath } from "./protected-prefixes";

/** Tells the sign-in screen why it was opened, so it can say so (MIN-691). */
export const SESSION_EXPIRED_PARAM = "session";
export const SESSION_EXPIRED_VALUE = "expired";

/** Where a screen that lost its session goes: sign-in, then back here. */
export function signInRedirectAfterSignOut(pathname: string, search: string, { expired = true } = {}): string | null {
  if (!isProtectedPath(pathname)) return null;
  const params = new URLSearchParams({ redirect: pathname + search });
  if (expired) params.set(SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE);
  return `/login?${params}`;
}

/** Public pages keep rendering signed out; protected ones return to sign-in. */
export function leaveProtectedScreenAfterSignOut(): void {
  const target = signInRedirectAfterSignOut(window.location.pathname, window.location.search);
  if (target) window.location.replace(target);
}
