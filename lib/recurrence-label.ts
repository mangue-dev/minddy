// Put a recurrence in words (MIN-136).
//
// “Every week” doesn’t say much: what we want to read is
// “every Monday”, “every 4th of the month”, “every July 31st”. There
// cadence alone is therefore not enough - it is the DEADLINE which brings the day, and the
// two are read together. Generic labels (namespace `Recurrence`,
// keys `daily`/`weekly`/…) remain for the activity log, the only place where
// the date is not at hand.

import type { useFormatter, useTranslations } from "next-intl";
import { dueDateHasTime } from "./due-date";
import type { RecurrenceCadence } from "./recurrence";
import { resolveApplicationLocale } from "./locale-language";

type RecurrenceT = ReturnType<typeof useTranslations<"Recurrence">>;
type Formatter = ReturnType<typeof useFormatter>;

/**
 * The date as it is written in the language: “4” and “1er” in French,
 * “4th” and “1st” in English. `Intl.PluralRules` in ordinal mode gives the
 * English rule without a table to maintain.
 */
function ordinalDay(day: number, locale: string): string {
  const resolved = resolveApplicationLocale(locale);
  if (resolved === "fr") return day === 1 ? "1er" : String(day);
  if (resolved === "de") return `${day}.`;
  if (resolved !== "en") return String(day);
  const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(day);
  const suffix = rule === "one" ? "st" : rule === "two" ? "nd" : rule === "few" ? "rd" : "th";
  return `${day}${suffix}`;
}

/**
 * The phrase of a recurrence, as it is displayed in the
 * cadence selector, on the “Recurrences” page and when hovering over a deadline.
 *
 * The time is added when the deadline has one — it is this which distinguishes
 * “every Monday” from “every Monday at 09:00”.
 */
export function recurrenceLabel(
  cadence: RecurrenceCadence,
  due: Date | null,
  t: RecurrenceT,
  format: Formatter,
  locale: string,
): string {
  // Without a deadline there is no day to name: the generic wording prevails.
  if (!due) return t(cadence);

  let label: string;
  switch (cadence) {
    case "daily":
      label = t("everyDay");
      break;
    case "weekly":
      label = t("everyWeekOn", {
        weekday: format.dateTime(due, { weekday: "long" }),
      });
      break;
    case "monthly":
      label = t("everyMonthOn", { day: ordinalDay(due.getDate(), locale) });
      break;
    case "yearly":
      label = t("everyYearOn", {
        date: format.dateTime(due, { day: "numeric", month: "long" }),
      });
      break;
  }

  if (!dueDateHasTime(due)) return label;
  return t("atTime", {
    label,
    time: format.dateTime(due, { hour: "2-digit", minute: "2-digit" }),
  });
}
