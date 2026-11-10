"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { MessageKey } from "@/lib/i18n-keys";
import type { NumoWatchGrant, NumoWatchRecurrence } from "@/lib/numo-watches";

/**
 * How a recurring reminder (MIN-953) reads to its user: its cadence and each
 * permission it holds. Shared by the settings list and by the card that asks
 * the user to confirm one, so both say the same thing in the same words.
 */

const GRANT_KEYS: Record<NumoWatchGrant, MessageKey<"Account">> = {
  notification: "numoWatchGrantNotification",
  outside_scope: "numoWatchGrantOutsideScope",
  pull_request: "numoWatchGrantPullRequest",
  external: "numoWatchGrantExternal",
  public_reply: "numoWatchGrantPublicReply",
  trash: "numoWatchGrantTrash",
  delete: "numoWatchGrantDelete",
  account: "numoWatchGrantAccount",
  administration: "numoWatchGrantAdministration",
};

export function useNumoWatchWording() {
  const t = useTranslations("Account");
  const format = useFormatter();

  /** `HH:MM` as the locale writes a time of day. */
  const time = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return format.dateTime(new Date(Date.UTC(2001, 0, 1, hour, minute)), { timeStyle: "short", timeZone: "UTC" });
  };
  // 1 January 2001 was a Monday: day n of that month is weekday n.
  const weekday = (value: number) =>
    format.dateTime(new Date(Date.UTC(2001, 0, value)), { weekday: "long", timeZone: "UTC" });

  return {
    cadence(recurrence: NumoWatchRecurrence): string {
      const at = { time: time(recurrence.time) };
      switch (recurrence.kind) {
        case "daily": return t("numoWatchEveryDay", at);
        case "weekdays": return t("numoWatchWeekdays", at);
        case "weekly": return t("numoWatchWeekly", { ...at, weekday: weekday(recurrence.weekday) });
        case "monthly": return t("numoWatchMonthly", { ...at, day: recurrence.day });
      }
    },
    grant(grant: NumoWatchGrant): string {
      return t(GRANT_KEYS[grant]);
    },
    /** The reminder's time zone, when its clock is not the one this browser shows. */
    foreignZone(timezone: string | null): string | null {
      if (!timezone || timezone === Intl.DateTimeFormat().resolvedOptions().timeZone) return null;
      return timezone;
    },
  };
}
