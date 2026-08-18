/**
 * The small pure boundary between an APNs payload and the Electron
 * shell (MIN-356). APNs delivers an untyped dictionary; the main process only retains
 * the visible text and a relative route of minddy.
 */

export interface NativePushContent {
  title: string;
  body: string;
  url: string | null;
}

/**
 * The macOS pane which lets the user lift an already pronounced refusal.
 *
 * The bundle id is set by the MAIN process, never provided by the remote page.
 * `id` directly selects the app instead of placing the person in front of the
 * entire list of notifications.
 */
export function nativeNotificationSettingsUrl(bundleId: string): string {
  return (
    "x-apple.systempreferences:com.apple.Notifications-Settings.extension" +
    `?id=${encodeURIComponent(bundleId)}`
  );
}

export function nativePushContent(input: unknown): NativePushContent | null {
  if (!input || typeof input !== "object") return null;
  const payload = input as Record<string, unknown>;
  const aps = payload.aps;
  if (!aps || typeof aps !== "object") return null;
  const alert = (aps as Record<string, unknown>).alert;

  let title = "minddy";
  let body = "";
  if (typeof alert === "string") body = alert;
  else if (alert && typeof alert === "object") {
    const value = alert as Record<string, unknown>;
    if (typeof value.title === "string" && value.title.trim()) title = value.title;
    if (typeof value.body === "string") body = value.body;
  } else return null;

  const url = nativePushTarget(payload.url);
  return { title, body, url };
}

/** A remote load can only open a route from the already chosen origin. */
export function nativePushTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const parsed = new URL(value, "https://minddy.invalid");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
