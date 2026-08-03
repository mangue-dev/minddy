"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "mangue-ui";
import { CalendarClock, IterationCw, ListPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import {
  CYCLES_ENABLED_META_KEY,
  CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY,
  CYCLE_AUTO_CAPTURE_STARTED_META_KEY,
  CYCLE_DURATION_WEEKS_META_KEY,
  CYCLE_INTENSITIES,
  CYCLE_INTENSITY_META_KEY,
  CYCLE_START_DOW_META_KEY,
  CYCLE_UPCOMING_COUNT_META_KEY,
  resolveCyclePrefs,
  type CyclePrefs,
} from "@/lib/cycle-prefs";

/**
 * Account → Cycles (MIN-32): every knob of the personal cross-project cycle.
 * All preferences live in auth user_metadata (the account-preferences
 * pattern): optimistic local state, write through updateUser, revert + toast
 * on failure. Toggling any of them invalidates the board cache — the next
 * GET /api/me/board lazily reconciles the cycle timeline (create/fill).
 *
 * L'interrupteur maître vit dans l'EN-TÊTE de son groupe (MIN-167) : le reste
 * des réglages n'existe que s'il est armé, et le lire au-dessus d'eux dit
 * exactement ça.
 */
export function AccountCyclesSection() {
  const t = useTranslations("Cycles");
  const locale = useLocale();
  const { user, updateUserMetadata } = useAuth();
  const queryClient = useQueryClient();

  const [prefs, setPrefs] = useState<CyclePrefs>(resolveCyclePrefs(user?.user_metadata));
  useEffect(() => {
    setPrefs(resolveCyclePrefs(user?.user_metadata));
  }, [user]);

  /**
   * Écriture optimiste, NON verrouillée : plus de `saving` partagé qui figeait
   * toute la section. updateUserMetadata sérialise et fusionne côté serveur, et
   * l'effet ci-dessus resynchronise depuis le user à jour ; revert + toast à
   * l'échec.
   */
  const save = async (metaKey: string, value: unknown, next: Partial<CyclePrefs>) => {
    if (!user) return;
    const prev = prefs;
    setPrefs({ ...prefs, ...next }); // optimistic — revert on failure below
    try {
      await updateUserMetadata({ [metaKey]: value });
      // The board read owns the cycle lifecycle — make it reconcile.
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    } catch (e) {
      setPrefs(prev);
      toast.error((e as Error).message);
    }
  };

  // Localized weekday names: 2024-01-01 is a Monday, so day i (ISO 1..7) is
  // Jan i of 2024.
  const dayName = (dow: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, dow))
    );

  // Le seul verrou légitime : les réglages fins n'ont de sens que cycles activés.
  const knobsDisabled = !user || !prefs.enabled;

  return (
    <>
      <SettingsGroup
        icon={IterationCw}
        title={t("enableTitle")}
        description={t("enableDesc")}
        action={
          <Switch
            id="cycles-enabled"
            checked={prefs.enabled}
            onCheckedChange={(v) =>
              void save(CYCLES_ENABLED_META_KEY, v, { enabled: v })
            }
            disabled={!user}
            aria-label={t("enableTitle")}
          />
        }
      />

      <SettingsGroup
        icon={CalendarClock}
        title={t("cadenceTitle")}
        description={t("cadenceDesc")}
      >
        <SettingsRow
          htmlFor="cycles-duration"
          label={t("durationLabel")}
          control={
            <Select
              value={String(prefs.durationWeeks)}
              onValueChange={(v) =>
                void save(CYCLE_DURATION_WEEKS_META_KEY, Number(v), {
                  durationWeeks: Number(v) as 1 | 2,
                })
              }
              disabled={knobsDisabled}
            >
              <SelectTrigger id="cycles-duration" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("durationOneWeek")}</SelectItem>
                <SelectItem value="2">{t("durationTwoWeeks")}</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          htmlFor="cycles-start-dow"
          label={t("startDowLabel")}
          control={
            <Select
              value={String(prefs.startDow)}
              onValueChange={(v) =>
                void save(CYCLE_START_DOW_META_KEY, Number(v), {
                  startDow: Number(v),
                })
              }
              disabled={knobsDisabled}
            >
              <SelectTrigger id="cycles-start-dow" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((dow) => (
                  <SelectItem key={dow} value={String(dow)}>
                    <span className="capitalize">{dayName(dow)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          htmlFor="cycles-upcoming"
          label={t("upcomingLabel")}
          control={
            <Select
              value={String(prefs.upcomingCount)}
              onValueChange={(v) =>
                void save(CYCLE_UPCOMING_COUNT_META_KEY, Number(v), {
                  upcomingCount: Number(v),
                })
              }
              disabled={knobsDisabled}
            >
              <SelectTrigger id="cycles-upcoming" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          htmlFor="cycles-intensity"
          label={t("intensityTitle")}
          hint={t("intensityDesc")}
          control={
            <Select
              value={prefs.intensity}
              onValueChange={(v) =>
                void save(CYCLE_INTENSITY_META_KEY, v, {
                  intensity: v as CyclePrefs["intensity"],
                })
              }
              disabled={knobsDisabled}
            >
              <SelectTrigger id="cycles-intensity" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLE_INTENSITIES.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`intensity_${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        icon={ListPlus}
        title={t("captureTitle")}
        description={t("captureDesc")}
      >
        <SettingsRow
          htmlFor="cycles-capture-started"
          label={t("captureStartedLabel")}
          control={
            <Switch
              id="cycles-capture-started"
              checked={prefs.autoCaptureStarted}
              onCheckedChange={(v) =>
                void save(CYCLE_AUTO_CAPTURE_STARTED_META_KEY, v, {
                  autoCaptureStarted: v,
                })
              }
              disabled={knobsDisabled}
            />
          }
        />

        <SettingsRow
          htmlFor="cycles-capture-completed"
          label={t("captureCompletedLabel")}
          control={
            <Switch
              id="cycles-capture-completed"
              checked={prefs.autoCaptureCompleted}
              onCheckedChange={(v) =>
                void save(CYCLE_AUTO_CAPTURE_COMPLETED_META_KEY, v, {
                  autoCaptureCompleted: v,
                })
              }
              disabled={knobsDisabled}
            />
          }
        />
      </SettingsGroup>
    </>
  );
}
