"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  notificationPlainText,
  type NotificationLabels,
} from "./notification-line";
import type { MyNotification } from "./types";

/** The translated words every client surface of a notification needs. */
export function useNotificationLabels(): NotificationLabels {
  const t = useTranslations("Inbox");
  const tIssue = useTranslations("Issue");
  const tTimeline = useTranslations("Timeline");
  return useMemo(() => ({
    someone: t("someone"),
    mcpFallback: tTimeline("mcpFallback"),
    somePageFallback: t("somePageFallback"),
    someIssueFallback: t("someIssueFallback", { entity: tIssue("entity").toLowerCase() }),
    automation: t("actorAutomation"),
    feedbackBoard: t("actorFeedbackBoard"),
  }), [t, tIssue, tTimeline]);
}

/**
 * A notification as plain text — actor, sentence, context — for a surface
 * that cannot draw a pill: the command palette, a desktop banner.
 */
export function useNotificationPlainText(): (n: MyNotification) => {
  actor: string;
  title: string;
  context: string | null;
} {
  const t = useTranslations("Inbox");
  const labels = useNotificationLabels();
  return useCallback(
    (n: MyNotification) => notificationPlainText(n, labels, (key, values) => t(key, values)),
    [labels, t],
  );
}
