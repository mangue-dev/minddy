/**
 * Desktop app CHANNEL (MIN-352) — what version of minddy the window
 * shows.
 *
 * ## What it is, and what it isn't
 *
 * The shell does not ship of UI: it is a window on an origin. The
 * channel therefore does not change anything in the binary — it changes the ADDRESS. `stable` loads
 * `www.minddy.app` (production), `preview` loads `preview.minddy.app` (the
 * last commit of `main`, before promotion).
 *
 * Both serve the **same Supabase project**: same accounts, same projects,
 * same tickets. Switching doesn't duplicate anything or lose anything. The only thing that
 * doesn't track is the SESSION — cookies are by origin, so the first
 * pass on preview asks to log in again once. Returning to stable
 * finds the production session, remaining intact.
 *
 * ## Why this module is PUR
 *
 * It is read from both sides of the bridge: by the main process, which decides which URL
 * to load (`desktop/src/main.ts`) and retains the choice on disk
 * (`desktop/src/channel-store.ts`), and by the PAGE, which displays the switch
 * (`components/settings/account-preferences-section.tsx`). No `electron`,
 * no React, no disk reading: just two strings and the table that
 * connects them.
 *
 * ## The channel does not travel over the bridge
 *
 * The page does not ASK which channel it is in: it reads it on its own
 * origin (`desktopChannelForOrigin`). This is the only source that cannot
 * lie — a pipe copied into the bridge would be a second state to keep
 * synchronous with the URL actually loaded, and it would eventually diverge on the day
 * a toggle fails. The bridge therefore only has one more member, in writing.
 */

import {
  DESKTOP_ORIGIN_OVERRIDE,
  DESKTOP_PREVIEW_ORIGIN,
  DESKTOP_STABLE_ORIGIN,
} from "@/lib/desktop/config";

/** `stable` = production, `preview` = the head of `main`. */
export type DesktopChannel = "stable" | "preview";

/** That of a new installation, and the one that we fall back on at the slightest doubt. */
export const DESKTOP_DEFAULT_CHANNEL: DesktopChannel = "stable";

/**
 * The pipe read from a value that comes from ELSEWHERE — a JSON file written by a
 * previous version, a message from the renderer.
 *
 * Anything that is not exactly `"preview"` falls back to the stable: a
 * file truncated, an invented value or a channel removed from a future version
 * should bring someone back to production, never block them there elsewhere.
 */
export function parseDesktopChannel(raw: unknown): DesktopChannel {
  return raw === "preview" ? "preview" : DESKTOP_DEFAULT_CHANNEL;
}

/**
 * The origin to load for this channel.
 *
 * ⚠ **The dev origin wins on the channel.** Pointed to `localhost`, the
 * shell does not have two channels to offer: it has the server that we are on train
 * to cast. Without this priority, checking the box in dev would send the window to
 * the real preview in the middle of a development session.
 */
export function desktopOriginForChannel(channel: DesktopChannel): string {
  if (DESKTOP_ORIGIN_OVERRIDE) return DESKTOP_ORIGIN_OVERRIDE;
  return channel === "preview" ? DESKTOP_PREVIEW_ORIGIN : DESKTOP_STABLE_ORIGIN;
}

/**
 * The channel of an origin, or `null` when it is neither.
 *
 * `null` is not a detail: this is the case of dev (`localhost`), and it is this
 * which tells the settings screen to **not show the switch at all**
 * rather than showing one which would do nothing. A checkbox that is checked
 * and remains where it was is worse than no checkbox.
 */
export function desktopChannelForOrigin(origin: string): DesktopChannel | null {
  if (origin === DESKTOP_PREVIEW_ORIGIN) return "preview";
  if (origin === DESKTOP_STABLE_ORIGIN) return "stable";
  return null;
}
