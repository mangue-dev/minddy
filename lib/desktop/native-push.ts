/**
 * La petite frontière pure entre une charge utile APNs et la coquille Electron
 * (MIN-356). APNs livre un dictionnaire non typé ; le main process n'en retient
 * que le texte visible et une route relative de minddy.
 */

export interface NativePushContent {
  title: string;
  body: string;
  url: string | null;
}

/**
 * Le volet macOS qui laisse l'utilisateur lever un refus déjà prononcé.
 *
 * Le bundle id est fixé par le MAIN process, jamais fourni par la page distante.
 * `id` sélectionne directement l'app au lieu de déposer la personne devant la
 * liste entière des notifications.
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

/** Une charge distante ne peut ouvrir qu'une route de l'origine déjà choisie. */
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
