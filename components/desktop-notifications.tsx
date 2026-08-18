"use client";

import { useDesktopNotifications } from "@/lib/use-desktop-notifications";

/**
 * The desktop app's native notifications host (MIN-291). No rendering:
 * this component only exists for its effect, next to `<PushServiceWorker />`
 * in the app providers — the two surfaces of the same need, each on
 * the platform where she walks.
 */
export function DesktopNotifications() {
  useDesktopNotifications();
  return null;
}
