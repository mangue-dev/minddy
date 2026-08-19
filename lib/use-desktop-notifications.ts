"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { getDesktopBridge } from "./desktop/bridge";
import { notificationActor, notificationTitle } from "./notification-line";
import { notificationLineKey, notificationTargetPath } from "./notification-target";
import { useNotifications } from "./use-notifications";
import type { MyNotification } from "./types";

/**
 * Desktop app native notifications (MIN-291) — **zero
 * new infrastructure**.
 *
 * The MIN-89 real-time bridge is already subscribed to ALL projects of
 * the user and refreshes `["notifications"]` at each writing: the list
 * that we read here therefore arrives by itself, without table, without key, without issuer.
 * All that remains is to make banners. The renderer emits them and Electron
 * makes them native; it's the same `new Notification()` as the web, verified
 * in a real window by the MIN-290 probe (permission already `granted`).
 *
 * **What we don't do, and which is assumed**: app left, nothing left. No
 * APNS, no FCM. Who wants to be warned for sure keeps the web, which has the
 * real push since MIN-183 (§3 of docs/desktop-electron.md).
 *
 * ## Silent boot
 *
 * On the first pass, we SAVES the list without displaying anything. Without that, opening the app in the morning would drop thirty banners at once — things that happened yesterday, none of which are current events. The
 * first list is not news: it is a state.
 */
export function useDesktopNotifications(): void {
  const { notifications, unreadCount } = useNotifications();
  const router = useRouter();
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const tTimeline = useTranslations("Timeline");

  /** `null` until the first list has arrived (see seeding). */
  const seen = useRef<Set<string> | null>(null);
  /** The banners still on the screen, to close them when the line is read. */
  const shown = useRef(new Map<string, Notification>());

  // The dock counter: the exact number of unread numbers, the same one that
  // carries the sidebar. `0` removes the token.
  useEffect(() => {
    getDesktopBridge()?.setBadgeCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    // MIN-356: recent shells receive the same line by APNs, even
    // when they are left. Also keeping the realtime relay would display
    // each event twice. The old shells retain this fold.
    if (bridge.registerForPushNotifications) return;
    if (typeof Notification === "undefined") return;

    if (seen.current === null) {
      seen.current = new Set(notifications.map((n) => n.id));
      return;
    }

    const fresh: MyNotification[] = [];
    for (const n of notifications) {
      if (seen.current.has(n.id)) continue;
      if (!n.read_at) fresh.push(n);
    }

    // The list goes from newest to oldest; the banners are stacking up
    // in the order of issue. We therefore start from the oldest so that the
    // most recent ends up ON TOP of the stack.
    if (Notification.permission === "granted") {
      const labels = {
        someone: t("someone"),
        mcpFallback: tTimeline("mcpFallback"),
        somePageFallback: t("somePageFallback"),
        someAgentConversationFallback: t("someAgentConversationFallback"),
        someIssueFallback: t("someIssueFallback", {
          entity: tIssue("entity").toLowerCase(),
        }),
      };
      for (const n of fresh.reverse()) {
        const path = notificationTargetPath(n);
        const sentence = t(notificationLineKey(n.type, n.from_numo), {
          actor: notificationActor(n, labels),
        });
        const native = new Notification(notificationTitle(n, labels), {
          body: n.comment_excerpt
            ? `${sentence} : ${n.comment_excerpt}`
            : sentence,
          // The `tag` is the destination path, like on the web side (public/sw.js):
          // two notifications on the same target REPLACE each other instead of stacking.
          ...(path ? { tag: path } : {}),
        });
        native.onclick = () => {
          // The window first: the click is delivered to the renderer, which is behind
          // what the user was looking at. Browsing without waking up shows nothing.
          bridge.focus();
          if (path) router.push(path);
          native.close();
          shown.current.delete(n.id);
        };
        shown.current.set(n.id, native);
      }
    }

    // Read elsewhere (another device, the inbox page, one click): the banner
    // has nothing more to announce. A system notification does not clear completely
    // alone — this is the same observation as lib/push/dismiss.ts on the web side.
    const byId = new Map(notifications.map((n) => [n.id, n]));
    for (const [id, native] of shown.current) {
      const row = byId.get(id);
      if (row && !row.read_at) continue;
      native.close();
      shown.current.delete(id);
    }

    // The register follows the list rather than growing indefinitely: one line
    // deleted leaves it, and it won't come back.
    seen.current = new Set(byId.keys());
  }, [notifications, router, t, tIssue, tTimeline]);
}
