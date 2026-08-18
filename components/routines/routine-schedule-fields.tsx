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
 * The fields of a CADENCE (MIN-185): days, time, time zone.
 *
 * A single component for the two surfaces that edit them — the `schedule` step
 * of the wizard and the detail editor. Two separate forms would have ended up
 * accept two different things; here there is only one rule, and it is
 * the one that `assertSchedule` enforces behind.
 *
 * **The days are chosen by SEVERAL**: “Monday and Thursday” is a
 * current cadence, and the app's multi-choice picker (the same as the
 * categories of a ticket) makes it without inventing anything.
 *
 * **The time zone is a searchable combobox**, not a text field: there are 400
 * IANA names, no one types them from memory, and a poorly typed name would cause
 * the routine at the wrong time — or refused it when creating, which
 * is better but still too late.
 *
 * The FREQUENCY is chosen in illustrated cards, on both sides: the flap of
 * detail is as wide as the wizard's modal, and two different drawings
 * for the same choice would only have made it unrecognizable from one screen to
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
   * Change frequency EMPTY the days of the other cadence and start those of the
   * new. Without that, going from weekly to monthly kept “Monday” in a
   * field that the monthly cadence prohibits — the cadence became invalid without
   * that nothing on the screen shows it — and left the day of the month blank, so
   * without any occurrence. Monday and the 1st are the defaults, like everywhere.
   */
  const setFrequency = (frequency: RoutineFrequency) =>
    onChange({
      ...value,
      frequency,
      weekdays: frequency === "weekly" ? (value.weekdays?.length ? value.weekdays : [1]) : [],
      daysOfMonth:
        frequency === "monthly" ? (value.daysOfMonth?.length ? value.daysOfMonth : [1]) : [],
    });

  // Monday at the top, Sunday at the end: the order of the week, not that of `Intl`.
  // Capital first: this is a field label, not a word in a sentence.
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

      {/* The three settings on ONE line: day, time, time zone. They
          answer just one question — when? — and read together.
          (A daily cadence does not have a day to choose: its two fields
          remaining expand on their own.) */}
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
 * The time zone, searchable — the ~400 names of `Intl.supportedValuesOf`, filtered at
 * hitting by the same combobox as the pattern picker (which already holds a
 * catalog of several hundred entries).
 *
 * The fallback when `supportedValuesOf` does not exist is not decorative: without
 * him, the field would be EMPTY on an old engine, and a routine could not
 * no longer be created at all. It then offers at least the current time zone.
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
    // The current time zone is always available, even if absent from the catalog.
    if (value && !zones.includes(value)) zones = [value, ...zones];
    return zones.map((zone) => ({
      value: zone,
      label: zone.replace(/_/g, " "),
      // “Paris” must find “Europe/Paris”: the city alone is a term
      // search in its own right, otherwise you have to type the continent first.
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

/** “UTC+2” — enough to recognize a time zone where only the city is read. */
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
