"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Combobox, Input, cn } from "mangue-ui";
import { CalendarDays, CalendarRange, ChevronDown, Sun } from "lucide-react";

import { PICKER_FIELD_TRIGGER, SearchMultiSelect } from "@/components/search-select";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import {
  sortedWeekdays,
  weekdayLabel,
  type RoutineFrequency,
  type RoutineSchedule,
} from "@/lib/routine-schedule";

/**
 * Les champs d'une CADENCE (MIN-185) : les jours, l'heure, le fuseau.
 *
 * Un seul composant pour les deux surfaces qui les éditent — l'étape `schedule`
 * du wizard et l'éditeur du détail. Deux formulaires séparés auraient fini par
 * accepter deux choses différentes ; ici il n'y a qu'une règle, et elle est
 * celle que `assertSchedule` fait respecter derrière.
 *
 * **Les jours se choisissent à PLUSIEURS** : « le lundi et le jeudi » est une
 * cadence courante, et le picker multi-choix de l'app (le même que les
 * catégories d'un ticket) la rend sans rien inventer.
 *
 * **Le fuseau est un combobox cherchable**, pas un champ texte : il y a 400
 * noms IANA, personne ne les tape de mémoire, et un nom mal tapé faisait partir
 * la routine à la mauvaise heure — ou la refusait au moment de créer, ce qui
 * est mieux mais toujours trop tard.
 *
 * La FRÉQUENCE se choisit en cartes illustrées, des deux côtés : le volet de
 * détail est aussi large que la modale du wizard, et deux dessins différents
 * pour un même choix n'auraient fait que le rendre méconnaissable d'un écran à
 * l'autre.
 */

const FREQUENCY_ICONS: Record<RoutineFrequency, typeof Sun> = {
  daily: Sun,
  weekly: CalendarDays,
  monthly: CalendarRange,
};

export function RoutineScheduleFields({
  value,
  onChange,
  className,
}: {
  value: RoutineSchedule;
  onChange: (next: RoutineSchedule) => void;
  className?: string;
}) {
  const t = useTranslations("Routines");
  const locale = useLocale();

  const patch = (fields: Partial<RoutineSchedule>) => onChange({ ...value, ...fields });

  /**
   * Changer de fréquence VIDE les jours de l'autre cadence et amorce ceux de la
   * nouvelle. Sans ça, passer d'hebdomadaire à mensuel gardait « lundi » dans un
   * champ que la cadence mensuelle interdit — la cadence devenait invalide sans
   * que rien à l'écran ne le montre — et laissait le jour du mois vide, donc
   * sans aucune occurrence. Le lundi et le 1er sont les défauts, comme partout.
   */
  const setFrequency = (frequency: RoutineFrequency) =>
    onChange({
      ...value,
      frequency,
      weekdays: frequency === "weekly" ? (value.weekdays?.length ? value.weekdays : [1]) : [],
      daysOfMonth:
        frequency === "monthly" ? (value.daysOfMonth?.length ? value.daysOfMonth : [1]) : [],
    });

  // Lundi en tête, dimanche à la fin : l'ordre de la semaine, pas celui d'`Intl`.
  // Capitale en tête : c'est un libellé de champ, pas un mot dans une phrase.
  const weekdayOptions = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 0].map((d) => ({
        value: String(d),
        label: weekdayLabel(d, locale),
      })),
    [locale],
  );

  const dayOptions = useMemo(
    () =>
      Array.from({ length: 31 }, (_, i) => ({
        value: String(i + 1),
        label: String(i + 1),
      })),
    [],
  );

  const selectedWeekdays = sortedWeekdays(value.weekdays);
  const selectedDays = [...(value.daysOfMonth ?? [])].sort((a, b) => a - b);

  const weekdaysLabel = selectedWeekdays.length
    ? selectedWeekdays.map((d) => weekdayLabel(d, locale)).join(", ")
    : t("weekdayPlaceholder");
  const dayLabel = selectedDays.length
    ? selectedDays.join(", ")
    : t("dayOfMonthPlaceholder");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        role="radiogroup"
        aria-label={t("frequencyLabel")}
      >
        {(["daily", "weekly", "monthly"] as const).map((f) => (
          <WizardChoiceCard
            key={f}
            selected={value.frequency === f}
            icon={FREQUENCY_ICONS[f]}
            label={t(`frequency_${f}` as "frequency_daily")}
            onSelect={() => setFrequency(f)}
          />
        ))}
      </div>

      {/* Les trois réglages sur UNE ligne : le jour, l'heure, le fuseau. Ils
          répondent à une seule question — quand ? — et se lisent ensemble.
          (Une cadence quotidienne n'a pas de jour à choisir : ses deux champs
          restants s'élargissent d'eux-mêmes.) */}
      <div
        className={cn(
          "grid grid-cols-1 gap-3",
          value.frequency === "daily" ? "sm:grid-cols-2" : "sm:grid-cols-3",
        )}
      >
        {value.frequency === "weekly" ? (
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            {t("weekdayLabel")}
            <SearchMultiSelect
              values={selectedWeekdays.map(String)}
              onChange={(values) =>
                patch({ weekdays: values.map(Number).sort((a, b) => a - b) })
              }
              options={weekdayOptions}
              searchPlaceholder={t("weekdaySearch")}
              trigger={
                <button type="button" className={PICKER_FIELD_TRIGGER}>
                  <span
                    className={cn(
                      "truncate",
                      selectedWeekdays.length ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {weekdaysLabel}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              }
            />
          </label>
        ) : null}

        {value.frequency === "monthly" ? (
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
            {t("dayOfMonthLabel")}
            <SearchMultiSelect
              values={selectedDays.map(String)}
              onChange={(values) =>
                patch({ daysOfMonth: values.map(Number).sort((a, b) => a - b) })
              }
              options={dayOptions}
              searchPlaceholder={t("dayOfMonthSearch")}
              trigger={
                <button type="button" className={PICKER_FIELD_TRIGGER}>
                  <span
                    className={cn(
                      "truncate",
                      selectedDays.length ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {dayLabel}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </button>
              }
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          {t("timeLabel")}
          <Input
            type="time"
            value={`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":");
              patch({
                hour: h === undefined ? value.hour : Number(h) || 0,
                minute: m === undefined ? value.minute : Number(m) || 0,
              });
            }}
            className="h-9"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          {t("timezoneLabel")}
          <TimezoneCombobox
            value={value.timezone}
            onChange={(timezone) => patch({ timezone })}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Le fuseau, cherchable — les ~400 noms d'`Intl.supportedValuesOf`, filtrés à
 * la frappe par le même combobox que le picker de modèle (qui tient déjà un
 * catalogue de plusieurs centaines d'entrées).
 *
 * Le repli quand `supportedValuesOf` n'existe pas n'est pas décoratif : sans
 * lui, le champ serait VIDE sur un moteur ancien, et une routine ne pourrait
 * plus être créée du tout. Il propose alors au moins le fuseau courant.
 */
export function TimezoneCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");

  const options = useMemo(() => {
    let zones: string[] = [];
    try {
      zones = Intl.supportedValuesOf?.("timeZone") ?? [];
    } catch {
      zones = [];
    }
    // Le fuseau courant est toujours proposable, même absent du catalogue.
    if (value && !zones.includes(value)) zones = [value, ...zones];
    return zones.map((zone) => ({
      value: zone,
      label: zone.replace(/_/g, " "),
      // « Paris » doit trouver « Europe/Paris » : la ville seule est un terme
      // de recherche à part entière, sinon il faut taper le continent d'abord.
      keywords: [zone, ...zone.split("/")],
      trailing: (
        <span className="text-xs text-muted-foreground tabular-nums">
          {offsetLabel(zone)}
        </span>
      ),
    }));
  }, [value]);

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={options}
      variant="field"
      placeholder={t("timezonePlaceholder")}
      searchPlaceholder={t("timezoneSearch")}
      emptyLabel={t("timezoneEmpty")}
      loadingLabel={tCommon("loading")}
      aria-label={t("timezoneLabel")}
    />
  );
}

/** « UTC+2 » — de quoi reconnaître un fuseau dont on ne lit que la ville. */
function offsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
