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
  Separator,
  Switch,
  toast,
} from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { SettingsSection } from "@/components/settings-shell";
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
 */
export function AccountCyclesSection() {
  const t = useTranslations("Cycles");
  const locale = useLocale();
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();

  const [prefs, setPrefs] = useState<CyclePrefs>(resolveCyclePrefs(user?.user_metadata));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPrefs(resolveCyclePrefs(user?.user_metadata));
  }, [user]);

  /** Optimistic metadata write shared by every control. */
  const save = async (metaKey: string, value: unknown, next: Partial<CyclePrefs>) => {
    if (!user || saving) return;
    const prev = prefs;
    setPrefs({ ...prefs, ...next }); // optimistic — revert on failure below
    setSaving(true);
    try {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      await updateUser({ data: { ...meta, [metaKey]: value } });
      // The board read owns the cycle lifecycle — make it reconcile.
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    } catch (e) {
      setPrefs(prev);
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Localized weekday names: 2024-01-01 is a Monday, so day i (ISO 1..7) is
  // Jan i of 2024.
  const dayName = (dow: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, dow))
    );

  const disabled = saving || !user;
  const knobsDisabled = disabled || !prefs.enabled;

  return (
    <>
      <SettingsSection title={t("enableTitle")} description={t("enableDesc")}>
        <div className="flex items-center gap-3">
          <Switch
            id="cycles-enabled"
            checked={prefs.enabled}
            onCheckedChange={(v) =>
              void save(CYCLES_ENABLED_META_KEY, v, { enabled: v })
            }
            disabled={disabled}
          />
          <label
            htmlFor="cycles-enabled"
            className="cursor-pointer text-sm text-foreground"
          >
            {t("enableLabel")}
          </label>
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title={t("cadenceTitle")} description={t("cadenceDesc")}>
        <div className="flex max-w-sm flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("durationLabel")}</span>
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
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("startDowLabel")}</span>
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
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("upcomingLabel")}</span>
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
          </div>
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection title={t("intensityTitle")} description={t("intensityDesc")}>
        <Select
          value={prefs.intensity}
          onValueChange={(v) =>
            void save(CYCLE_INTENSITY_META_KEY, v, {
              intensity: v as CyclePrefs["intensity"],
            })
          }
          disabled={knobsDisabled}
        >
          <SelectTrigger id="cycles-intensity" className="max-w-sm">
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
      </SettingsSection>

      <Separator />

      <SettingsSection title={t("captureTitle")} description={t("captureDesc")}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
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
            <label
              htmlFor="cycles-capture-started"
              className="cursor-pointer text-sm text-foreground"
            >
              {t("captureStartedLabel")}
            </label>
          </div>
          <div className="flex items-center gap-3">
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
            <label
              htmlFor="cycles-capture-completed"
              className="cursor-pointer text-sm text-foreground"
            >
              {t("captureCompletedLabel")}
            </label>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}
