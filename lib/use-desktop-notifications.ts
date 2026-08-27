"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { getDesktopBridge } from "./desktop/bridge";
import { notificationActor, notificationTitle } from "./notification-line";
import { notificationLineKey, notificationTargetPath } from "./notification-target";
import { useNotifications } from "./use-notifications";
import { usePushDevicesQuery } from "./use-push-devices-query";
import type { MyNotification } from "./types";

/**
 * Desktop app real-time native notifications (MIN-291, MIN-474).
 *
 * The MIN-89 real-time bridge is already subscribed to ALL projects of
 * the user and refreshes `["notifications"]` at each writing: the list
 * that we read here therefore arrives by itself, without table, without key, without issuer.
 * The renderer formats inbox rows, while the main process validates the payload
 * and owns Electron's native `Notification` objects. Platforms with an active
 * background transport skip this relay so one event cannot produce two banners.
 *
 * ## Silent boot
 *
 * On the first pass, we SAVES the list without displaying anything. Without that, opening the app in the morning would drop thirty banners at once — things that happened yesterday, none of which are current events. The
 * first list is not news: it is a state.
 */
export function useDesktopNotifications(): void {
  const { notifications, unreadCount } = useNotifications();
  const { capabilities: pushCapabilities } = usePushDevicesQuery();
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const tTimeline = useTranslations("Timeline");

  /** `null` until the first list has arrived (see seeding). */
  const seen = useRef<Set<string> | null>(null);
  /** Banner ids sent to the main process and still associated with unread rows. */
  const shown = useRef(new Set<string>());

  // The dock counter: the exact number of unread numbers, the same one that
  // carries the sidebar. `0` removes the token.
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (bridge?.notificationCapabilities?.badge === "dock") {
      bridge.setBadgeCount(unreadCount);
    }
  }, [unreadCount]);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const capabilities = bridge.notificationCapabilities;
    if (!capabilities?.localNativeBanners || !bridge.showLocalNotification) return;
    // Packaged macOS receives this same event through APNs. When the app is
    // running, Electron delivers that push to the main process, which shows it.
    if (capabilities.backgroundTransport === "apns") return;
    if (capabilities.backgroundTransport === "wns") {
      // Self-hosted servers may intentionally omit WNS credentials. Wait for
      // the capability response, then retain the live local relay as fallback.
      if (!pushCapabilities || pushCapabilities.wns) return;
    }

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
      const target = notificationTargetPath(n);
      const sentence = t(notificationLineKey(n.type, n.from_numo), {
        actor: notificationActor(n, labels),
      });
      bridge.showLocalNotification({
        id: n.id,
        title: notificationTitle(n, labels) || "minddy",
        body: n.comment_excerpt ? `${sentence}: ${n.comment_excerpt}` : sentence,
        target,
      });
      shown.current.add(n.id);
    }

    // Read elsewhere (another device, the inbox page, one click): the banner
    // has nothing more to announce. A system notification does not clear completely
    // alone — this is the same observation as lib/push/dismiss.ts on the web side.
    const byId = new Map(notifications.map((n) => [n.id, n]));
    for (const id of shown.current) {
      const row = byId.get(id);
      if (row && !row.read_at) continue;
      bridge.dismissLocalNotification?.(id);
      shown.current.delete(id);
    }

    // The register follows the list rather than growing indefinitely: one line
    // deleted leaves it, and it won't come back.
    seen.current = new Set(byId.keys());
  }, [notifications, pushCapabilities, t, tIssue, tTimeline]);
}
