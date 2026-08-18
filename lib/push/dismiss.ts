"use client";

/**
 * Close a pushed notification when you arrive on the page it designates.
 *
 * A system notification does not disappear on its own: once displayed, it
 * stays in the notification center until swiped by hand —
 * including when we read the comment she announced, in the app, ten
 * seconds earlier. Clicking on the banner closes it (`notificationclick`
 * in public/sw.js); it's the next way, the one that goes through the app, that
 * left everything behind.
 *
 * ## What “the affected page” means
 *
 * The pushed payload carries the path to its target (`notificationTargetPath`),
 * and nothing else identifies it. The comparison is therefore made URL against URL:
 * same path, and same values ​​for the parameters that DESIGNATE the target
 * (`NOTIFICATION_TARGET_PARAMS`). Other parameters are ignored in the
 * two meanings — the app adds more (a tab, a filter, a view) without it changing
 * what we are looking at.
 *
 * The asymmetry is intended: a ticket notification (`?issue=…`) does not close
 * NOT because we are on the board that contains it, only when the ticket
 * itself is open.
 *
 * ## Where it lives
 *
 * Here and nowhere else. The service worker does not decide anything: he warns
 * tabs it just displayed something (`push-shown`), and that's the
 * page — the only one to know what it displays — which decides. He couldn't
 * do otherwise anyway: public/sw.js is served as is, without build,
 * donc sans import.
 */

import { NOTIFICATION_TARGET_PARAMS } from "@/lib/notification-target";

/** False base: the two URLs are relative paths, the origin is only used to
 * `new URL` and disappears from the comparison. */
const BASE = "http://minddy.invalid";

/** `/inbox/` and `/inbox` are the same page. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * Is the screen currently displayed (`currentUrl`) the one to which a
 * notification (`targetUrl`)? Both are relative paths, possibly
 * with a query.
 */
export function showsNotificationTarget(
  currentUrl: string,
  targetUrl: string
): boolean {
  let current: URL;
  let target: URL;
  try {
    current = new URL(currentUrl, BASE);
    target = new URL(targetUrl, BASE);
  } catch {
    return false;
  }

  if (normalizePath(current.pathname) !== normalizePath(target.pathname)) {
    return false;
  }

  for (const param of NOTIFICATION_TARGET_PARAMS) {
    const wanted = target.searchParams.get(param);
    if (wanted === null) continue;
    if (current.searchParams.get(param) !== wanted) return false;
  }
  return true;
}

/** What a displayed notification leads to: the service worker places it in
 * `data.url`, and falls back on `tag` (which is the same path) for safety. */
function notificationUrl(notification: Notification): string | null {
  const fromData = (notification.data as { url?: unknown } | null)?.url;
  if (typeof fromData === "string" && fromData) return fromData;
  return notification.tag || null;
}

/**
 * Closes all displayed notifications that lead to the given screen. Make it
 * number of closed notifications.
 *
 * Best-effort from start to finish, and silent: without permission there is no
 * recording, without recording there is nothing to close, and
 * `getNotifications` is still missing on some Safaris — none of these cases are
 * a failure, and none has to be traced back to the user.
 */
export async function closeNotificationsForView(currentUrl: string): Promise<number> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return 0;
  // Without permission, NOTHING can be posted: we go out before
  // least await. This is the case for the vast majority of visits, and that
  // is called every time you browse.
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return 0;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration || typeof registration.getNotifications !== "function") return 0;

    const notifications = await registration.getNotifications();
    let closed = 0;
    for (const notification of notifications) {
      const url = notificationUrl(notification);
      if (!url || !showsNotificationTarget(currentUrl, url)) continue;
      notification.close();
      closed++;
    }
    return closed;
  } catch {
    return 0;
  }
}
