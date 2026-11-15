/**
 * Browser storage that belongs to the signed-in account, swept at sign-out so
 * the next account on a shared machine starts clean (MIN-999).
 *
 * Every key minddy writes starts with `minddy` (`minddy.`, `minddy:`,
 * `minddy-cp…`). Instead of listing them one by one, which let new keys
 * outlive the account (palette favorites, last page, active view), the sweep
 * removes the whole family and keeps only the device-level keys below.
 */

/**
 * Keys that describe the device or this browser, not the account, and so
 * survive a sign-out. Keys outside the `minddy` family (the theme cache
 * `mangue-ui-theme`, `cookie_consent`, analytics consent) are never touched.
 */
export const DEVICE_STORAGE_KEYS: ReadonlySet<string> = new Set([
  // Interface layout of this window, not an account preference.
  "minddy.sidebar-hidden",
  // Measured on-screen keyboard height of this phone.
  "minddy:keyboard-height",
  // Desktop diagnostics flag, set by hand.
  "minddy.trace",
  // The desktop update this machine already dismissed.
  "minddy.dismissed-version",
  // Whether this device already played the welcome sequence.
  "minddy:welcome-seen",
  // An OAuth round started by the desktop app, which may complete after a
  // sign-out of another account in this window.
  "minddy.desktop.auth-turn",
  // Which documentation topics are open in this tab.
  "minddy-docs-topics",
]);

/**
 * Issue and objective drafts (`lib/drafts.ts`) are sealed to their owner, so
 * the next account cannot read them, and the manual promises they stay on
 * this device for 30 days: they survive a sign-out for the same owner.
 */
const KEPT_ACCOUNT_PREFIXES = ["minddy:drafts:"];

/** Legacy account keys from before the `minddy` naming. */
const LEGACY_ACCOUNT_PREFIXES = ["assistant-active-conv-"];

export function isAccountStorageKey(key: string): boolean {
  if (DEVICE_STORAGE_KEYS.has(key)) return false;
  if (KEPT_ACCOUNT_PREFIXES.some((prefix) => key.startsWith(prefix))) return false;
  return key.startsWith("minddy") || LEGACY_ACCOUNT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Remove the account's keys from the given storages. Never throws. */
export function clearAccountStorage(storages?: Storage[]): void {
  let targets = storages;
  if (!targets) {
    if (typeof window === "undefined") return;
    targets = [];
    try {
      targets.push(window.localStorage, window.sessionStorage);
    } catch {
      // Storage access can throw (blocked site data); nothing to clear then.
    }
  }
  for (const storage of targets) {
    try {
      // Copy the keys first: removing while iterating skips entries.
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key !== null) keys.push(key);
      }
      for (const key of keys) {
        if (isAccountStorageKey(key)) storage.removeItem(key);
      }
    } catch {
      // Storage is optional; sign-out must go on.
    }
  }
}

/**
 * Ask the server to clear this origin's HTTP cache (`Clear-Site-Data`). Best
 * effort: it never delays or blocks the sign-out.
 */
export function requestSiteDataClear(): void {
  if (typeof fetch === "undefined") return;
  try {
    void fetch("/api/auth/sign-out", { method: "POST", keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    // A missing fetch or a blocked request changes nothing for the user.
  }
}
