import { isProtectedPath } from "./protected-prefixes";

/** Where a screen that lost its session goes: sign-in, then back here. */
export function signInRedirectAfterSignOut(pathname: string, search: string): string | null {
  return isProtectedPath(pathname) ? `/login?redirect=${encodeURIComponent(pathname + search)}` : null;
}

/** Public pages keep rendering signed out; protected ones return to sign-in. */
export function leaveProtectedScreenAfterSignOut(): void {
  const target = signInRedirectAfterSignOut(window.location.pathname, window.location.search);
  if (target) window.location.replace(target);
}
