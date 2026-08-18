import "server-only";

import { isPushInstallationId } from "@/lib/desktop/push-installation";

/**
 * What a device (re)registration decides is its `enabled` and its
 * `locale` (MIN-183).
 *
 * TWO very different gestures go through the same route POST:
 *
 * • an ACTIVATION — the settings switch, the permission that we just
 * granted. Switching ON IS its purpose ;
 * • a REFRESH — the recovery when the app
 * (components/push-service-worker.tsx) is loaded, and the re-subscription that the
 * browser triggers on its own (`pushsubscriptionchange`). Nobody asked
 * anything: they must not change ANYTHING that the user has set.
 *
 * Confusing them was expensive, and invisibly: `enabled: true` in hard
 * restarted the device that had just been turned off each time a page was loaded. The
 * gesture worked under the fingers, the line returned to "active" at the next navigation
 * — the switch per device, which is the heart of the ticket, did not hold
 * a second page.
 *
 * The language follows the same rule: the service worker does not have one to give (it does not
 * read the cookie `NEXT_LOCALE`). In its absence, we keep that of the previous line
 * rather than falling back to English — a spontaneous re-subscription
 * has no reason to switch a French telephone to English.
 */

/** The state of the device BEFORE this POST: its line, or the one that a re-subscription
 * has just expired (`oldEndpoint`). `null` when there is none. */
export interface PriorRegistration {
  enabled: boolean;
  locale: string | null;
}

export interface ParsedPushRegistration {
  endpoint: string;
  transport: "web" | "apns";
  p256dh: string | null;
  auth: string | null;
  installationId: string | null;
}

/** Validates the local form before the route does web network checking. */
export function parsePushRegistration(input: unknown): ParsedPushRegistration | null {
  if (!input || typeof input !== "object") return null;
  const value = input as {
    endpoint?: unknown;
    transport?: unknown;
    installationId?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (value.transport === "apns") {
    if (
      typeof value.endpoint !== "string" ||
      !/^apns:[a-f0-9]{32,512}$/i.test(value.endpoint) ||
      !isPushInstallationId(value.installationId)
    ) return null;
    return {
      endpoint: value.endpoint,
      transport: "apns",
      p256dh: null,
      auth: null,
      installationId: value.installationId,
    };
  }

  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (
    typeof value.endpoint !== "string" ||
    !value.endpoint.startsWith("https://") ||
    typeof p256dh !== "string" ||
    !p256dh ||
    typeof auth !== "string" ||
    !auth
  ) return null;
  return {
    endpoint: value.endpoint,
    transport: "web",
    p256dh,
    auth,
    installationId: null,
  };
}

export function resolveRegistrationState(
  prior: PriorRegistration | null,
  input: { locale?: unknown; refresh?: unknown }
): { enabled: boolean; locale: string } {
  const locale =
    typeof input.locale === "string" && input.locale.trim()
      ? input.locale.trim()
      : prior?.locale?.trim() || "en";
  return {
    // A PRESERVE refreshment; everything else lights up. Without line
    // previous, a refresh carries a subscription that the server does not
    // didn't know: it is born active, like an activation.
    enabled: input.refresh === true ? (prior?.enabled ?? true) : true,
    locale,
  };
}
