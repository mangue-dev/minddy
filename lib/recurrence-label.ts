// Mettre une récurrence en mots (MIN-136).
//
// « Toutes les semaines » ne dit pas grand-chose : ce qu'on veut lire, c'est
// « tous les lundis », « tous les 4 du mois », « tous les 31 juillet ». La
// cadence seule ne suffit donc pas — c'est l'ÉCHÉANCE qui porte le jour, et les
// deux se lisent ensemble. Les libellés génériques (namespace `Recurrence`,
// clés `daily`/`weekly`/…) restent pour le journal d'activité, seul endroit où
// la date n'est pas sous la main.

import type { useFormatter, useTranslations } from "next-intl";
import { dueDateHasTime } from "./due-date";
import type { RecurrenceCadence } from "./recurrence";

type RecurrenceT = ReturnType<typeof useTranslations<"Recurrence">>;
type Formatter = ReturnType<typeof useFormatter>;

/**
 * Le quantième tel qu'on l'écrit dans la langue : « 4 » et « 1er » en français,
 * « 4th » et « 1st » en anglais. `Intl.PluralRules` en mode ordinal donne la
 * règle anglaise sans table à maintenir.
 */
function ordinalDay(day: number, locale: string): string {
  if (locale.startsWith("fr")) return day === 1 ? "1er" : String(day);
  const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(day);
  const suffix = rule === "one" ? "st" : rule === "two" ? "nd" : rule === "few" ? "rd" : "th";
  return `${day}${suffix}`;
}

/**
 * La phrase d'une récurrence, telle qu'elle s'affiche dans le sélecteur de
 * cadence, sur la page « Récurrences » et au survol d'une échéance.
 *
 * L'heure s'ajoute quand l'échéance en porte une — c'est elle qui distingue
 * « tous les lundis » de « tous les lundis à 09:00 ».
 */
export function recurrenceLabel(
  cadence: RecurrenceCadence,
  due: Date | null,
  t: RecurrenceT,
  format: Formatter,
  locale: string,
): string {
  // Sans échéance il n'y a pas de jour à nommer : le libellé générique fait foi.
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
