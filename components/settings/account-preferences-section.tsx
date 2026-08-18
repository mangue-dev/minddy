"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  Switch,
  useTheme,
  toast,
  type SegmentedControlOption,
} from "mangue-ui";
import { Keyboard, Palette, Ticket } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { setLocaleCookie } from "@/lib/set-locale";
import { locales, type Locale } from "@/i18n/config";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  NUMO_DEFAULT_STATUS_OPTIONS,
  resolveNumoDefaultStatus,
  type NumoDefaultStatus,
} from "@/lib/numo-default-status";
import {
  PROMPT_COPY_AUTO_START_META_KEY,
  resolvePromptCopyAutoStart,
} from "@/lib/prompt-copy-auto-start";
import {
  AUTO_ASSIGN_ON_START_META_KEY,
  resolveAutoAssignOnStart,
} from "@/lib/auto-assign-on-start";
import { resolveSmartFill, SMART_FILL_META_KEY } from "@/lib/smart-fill";
import {
  SEND_MODE_META_KEY,
  resolveSendMode,
  type SendMode,
} from "@/lib/keyboard/send-shortcut";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";

const LANGUAGE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

/** `""` = “we don’t know yet”: the theme only exists on the client side, and
    no segment must light up before editing (see `mounted`). */
type ThemeValue = "light" | "dark" | "system" | "";

/** Account → Preferences: two groups, appearance and what tickets do.
    The six stacked sections from before weren't six subjects, they were six
    settings: everyone had the right to their title, no one had a neighbor. */
export function AccountPreferencesSection() {
  const ta = useTranslations("Account");
  const tLang = useTranslations("Language");
  const tNav = useTranslations("Nav");
  const tStatus = useTranslations("Status");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const { user, updateUser, updateUserMetadata } = useAuth();
  const { theme, setTheme } = useTheme();
  const modKey = useModKey();
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Theme is only known client-side; wait for mount before highlighting so the
  // active option doesn't mismatch during hydration.
  useEffect(() => setMounted(true), []);

  // Auto-assign preference lives in user_metadata (like locale). Mirror it into
  // local state so the switch flips instantly, then reconcile once the account
  // update resolves (or a Realtime user refresh lands).
  const [autoAssign, setAutoAssign] = useState(
    user?.user_metadata?.auto_assign_created === true,
  );
  useEffect(() => {
    setAutoAssign(user?.user_metadata?.auto_assign_created === true);
  }, [user]);

  // Optimistic and NOT locked: the switch switches immediately, writing
  // GoTrue is serialized by updateUserMetadata (merge-safe), revert to failure.
  const toggleAutoAssign = async (next: boolean) => {
    if (!user) return;
    setAutoAssign(next);
    try {
      await updateUserMetadata({ auto_assign_created: next });
    } catch (e) {
      setAutoAssign(!next);
      toast.error((e as Error).message);
    }
  };

  // "Starting an issue self-assigns it" preference (user_metadata, like the
  // others). Enabled by default, so mirror the resolved value into local state.
  const [autoAssignStart, setAutoAssignStart] = useState(
    resolveAutoAssignOnStart(user?.user_metadata),
  );
  useEffect(() => {
    setAutoAssignStart(resolveAutoAssignOnStart(user?.user_metadata));
  }, [user]);

  const toggleAutoAssignStart = async (next: boolean) => {
    if (!user) return;
    setAutoAssignStart(next);
    try {
      await updateUserMetadata({ [AUTO_ASSIGN_ON_START_META_KEY]: next });
    } catch (e) {
      setAutoAssignStart(!next);
      toast.error((e as Error).message);
    }
  };

  // Smart-fill (MIN-260): the creation form fills only priority,
  // effort, categories and objective. Enabled by default, like both
  // above — hence the passage by `resolveSmartFill` rather than a `=== true`.
  const [smartFill, setSmartFill] = useState(resolveSmartFill(user?.user_metadata));
  useEffect(() => {
    setSmartFill(resolveSmartFill(user?.user_metadata));
  }, [user]);

  const toggleSmartFill = async (next: boolean) => {
    if (!user) return;
    setSmartFill(next);
    try {
      await updateUserMetadata({ [SMART_FILL_META_KEY]: next });
    } catch (e) {
      setSmartFill(!next);
      toast.error((e as Error).message);
    }
  };

  // "Copy prompt starts the issue" preference (user_metadata, like auto-assign).
  // Enabled by default, so mirror the resolved value into local state.
  const [promptAutoStart, setPromptAutoStart] = useState(
    resolvePromptCopyAutoStart(user?.user_metadata),
  );
  useEffect(() => {
    setPromptAutoStart(resolvePromptCopyAutoStart(user?.user_metadata));
  }, [user]);

  const togglePromptAutoStart = async (next: boolean) => {
    if (!user) return;
    setPromptAutoStart(next);
    try {
      await updateUserMetadata({ [PROMPT_COPY_AUTO_START_META_KEY]: next });
    } catch (e) {
      setPromptAutoStart(!next);
      toast.error((e as Error).message);
    }
  };

  // Landing status for issues Numo creates (user_metadata, like the two above).
  const [numoStatus, setNumoStatus] = useState<NumoDefaultStatus>(
    resolveNumoDefaultStatus(user?.user_metadata),
  );
  useEffect(() => {
    setNumoStatus(resolveNumoDefaultStatus(user?.user_metadata));
  }, [user]);

  const changeNumoStatus = async (next: NumoDefaultStatus) => {
    if (!user || next === numoStatus) return;
    const prev = numoStatus;
    setNumoStatus(next);
    try {
      await updateUserMetadata({ numo_default_status: next });
    } catch (e) {
      setNumoStatus(prev);
      toast.error((e as Error).message);
    }
  };

  // The sending shortcut (MIN-287). Same mechanics as its neighbors, except that
  // it is not a Boolean: a mode, the default of which is that of always.
  const [sendMode, setSendMode] = useState<SendMode>(
    resolveSendMode(user?.user_metadata),
  );
  useEffect(() => {
    setSendMode(resolveSendMode(user?.user_metadata));
  }, [user]);

  const changeSendMode = async (next: SendMode) => {
    if (!user || next === sendMode) return;
    const prev = sendMode;
    setSendMode(next);
    try {
      await updateUserMetadata({ [SEND_MODE_META_KEY]: next });
    } catch (e) {
      setSendMode(prev);
      toast.error((e as Error).message);
    }
  };

  const switchLocale = async (locale: Locale) => {
    if (locale === currentLocale || switchingLocale) return;
    setSwitchingLocale(true);
    try {
      await setLocaleCookie(locale);
      if (user) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        await updateUser({ data: { ...meta, locale } });
      }
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSwitchingLocale(false);
    }
  };

  const sendModeOptions: SegmentedControlOption<SendMode>[] = [
    { value: "mod-enter", label: ta("sendShortcutModEnter", { mod: modKey }) },
    { value: "enter", label: ta("sendShortcutEnter") },
  ];

  const themeOptions: SegmentedControlOption<ThemeValue>[] = [
    { value: "light", label: tNav("themeLight") },
    { value: "dark", label: tNav("themeDark") },
    { value: "system", label: tNav("themeSystem") },
  ];

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountAppearance}
        icon={Palette}
        title={tNav("appearance")}
        description={ta("appearanceSectionDesc")}
      >
        <SettingsRow
          htmlFor="account-language"
          label={tLang("title")}
          control={
            <Select
              value={currentLocale}
              onValueChange={(value) => void switchLocale(value as Locale)}
              disabled={switchingLocale}
            >
              <SelectTrigger id="account-language" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingsRow
          label={ta("themeTitle")}
          control={
            <SegmentedControl
              options={themeOptions}
              value={mounted ? ((theme ?? "") as ThemeValue) : ""}
              onChange={(v) => v && setTheme(v)}
              ariaLabel={ta("themeTitle")}
              className="w-60"
            />
          }
        />
      </SettingsGroup>

      {/* Keyboard — only one setting for now, but a subject of its own: the
          send gesture is neither an appearance nor a ticket property. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountKeyboard}
        icon={Keyboard}
        title={ta("keyboardSectionTitle")}
        description={ta("keyboardSectionDesc")}
      >
        <SettingsRow
          label={ta("sendShortcutTitle")}
          hint={ta("sendShortcutDesc", { mod: modKey })}
          control={
            <SegmentedControl
              options={sendModeOptions}
              value={sendMode}
              onChange={(v) => void changeSendMode(v)}
              ariaLabel={ta("sendShortcutTitle")}
              className="w-60"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountIssues}
        icon={Ticket}
        title={tNav("tickets")}
        description={ta("ticketsSectionDesc")}
      >
        <SettingsRow
          htmlFor="account-auto-assign"
          label={ta("autoAssignLabel")}
          control={
            <Switch
              id="account-auto-assign"
              checked={autoAssign}
              onCheckedChange={(v) => void toggleAutoAssign(v)}
              disabled={!user}
            />
          }
        />

        <SettingsRow
          htmlFor="account-auto-assign-start"
          label={ta("autoAssignStartLabel")}
          hint={ta("autoAssignStartDesc")}
          control={
            <Switch
              id="account-auto-assign-start"
              checked={autoAssignStart}
              onCheckedChange={(v) => void toggleAutoAssignStart(v)}
              disabled={!user}
            />
          }
        />

        <SettingsRow
          htmlFor="account-smart-fill"
          label={ta("smartFillLabel")}
          hint={ta("smartFillDesc")}
          control={
            <Switch
              id="account-smart-fill"
              checked={smartFill}
              onCheckedChange={(v) => void toggleSmartFill(v)}
              disabled={!user}
            />
          }
        />

        <SettingsRow
          htmlFor="account-prompt-auto-start"
          label={ta("promptAutoStartLabel")}
          hint={ta("promptAutoStartDesc")}
          control={
            <Switch
              id="account-prompt-auto-start"
              checked={promptAutoStart}
              onCheckedChange={(v) => void togglePromptAutoStart(v)}
              disabled={!user}
            />
          }
        />

        <SettingsRow
          htmlFor="account-numo-status"
          label={ta("numoStatusTitle")}
          hint={ta("numoStatusDesc")}
          control={
            <Select
              value={numoStatus}
              onValueChange={(v) => void changeNumoStatus(v as NumoDefaultStatus)}
              disabled={!user}
            >
              <SelectTrigger id="account-numo-status" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NUMO_DEFAULT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <StatusIndicator status={s} className="size-4" />
                      {tStatus(s)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>
    </>
  );
}
