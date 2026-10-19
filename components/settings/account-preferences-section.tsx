"use client";

import {useEffect, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { SegmentedControlOption } from "@/components/ui/segmented-control";

import {useAuth} from "@/lib/auth-context";
import {setLocaleCookie} from "@/lib/set-locale";
import {locales} from "@/i18n/config";
import type {Locale} from "@/i18n/config";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import {SEND_MODE_META_KEY, resolveSendMode} from "@/lib/keyboard/send-shortcut";
import type {SendMode} from "@/lib/keyboard/send-shortcut";
import {useModKey} from "@/lib/keyboard/use-mod-shortcut";
import {useAccountPreference} from "@/components/settings/use-account-preference";
import {useAccountTheme} from "@/lib/use-account-theme";
import {ThemePresetPicker} from "@/components/settings/theme-preset-picker";
import type {ThemeMode, ThemePresetId} from "@/lib/theme-presets";

const LANGUAGE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  es: "Español",
};

/** `""` = “we don’t know yet”: the theme only exists on the client side, and
    no segment must light up before editing (see `mounted`). */
type ThemeValue = "light" | "dark" | "system" | "";

/** Account → Preferences: how minddy looks and how the keyboard sends.
    What issues do moved to the Issues and Smart Fill tabs (MIN-737); each
    Appearance row is also a ⌘K destination of its own. */
export function AccountPreferencesSection() {
  const ta = useTranslations("Account");
  const tLang = useTranslations("Language");
  const tNav = useTranslations("Nav");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const { user, updateUser } = useAuth();
  // The theme is an ACCOUNT setting: the hook persists the choice to
  // user_metadata so it follows the account to every device.
  const { theme, setTheme, appearance, setPreset, setTransparency } = useAccountTheme();
  const modKey = useModKey();
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Theme is only known client-side; wait for mount before highlighting so the
  // active option doesn't mismatch during hydration.
  useEffect(() => setMounted(true), []);

  // The sending shortcut (MIN-287): a mode rather than a Boolean, whose
  // default is that of always.
  const [sendMode, changeSendMode] = useAccountPreference<SendMode>(
    SEND_MODE_META_KEY,
    resolveSendMode,
  );

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

  // Palettes and glass apply on screen at once; a failed save has already put
  // the previous value back, so only the failure needs saying.
  const changePreset = async (mode: ThemeMode, preset: ThemePresetId) => {
    if (!(await setPreset(mode, preset))) toast.error(ta("themeAppearanceSaveFailed"));
  };
  const changeTransparency = async (enabled: boolean) => {
    if (!(await setTransparency(enabled))) toast.error(ta("themeAppearanceSaveFailed"));
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
        title={tNav("appearance")}
      >
        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountLanguage}
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
          anchor={SETTINGS_SECTIONS.accountTheme}
          label={ta("themeTitle")}
          hint={ta("themeSyncHint")}
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

        {/* One palette per mode (MIN-696): the active mode's choice repaints
            the app at once, the other one is kept for when it comes back. */}
        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountThemeLight}
          htmlFor="account-theme-light"
          label={ta("themeLightPresetTitle")}
          hint={ta("themeLightPresetHint")}
          control={
            <ThemePresetPicker
              id="account-theme-light"
              mode="light"
              value={appearance.light}
              onChange={(preset) => void changePreset("light", preset)}
            />
          }
        />
        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountThemeDark}
          htmlFor="account-theme-dark"
          label={ta("themeDarkPresetTitle")}
          hint={ta("themeDarkPresetHint")}
          control={
            <ThemePresetPicker
              id="account-theme-dark"
              mode="dark"
              value={appearance.dark}
              onChange={(preset) => void changePreset("dark", preset)}
            />
          }
        />
        <SettingsRow
          anchor={SETTINGS_SECTIONS.accountTransparency}
          htmlFor="account-theme-transparency"
          label={ta("themeTransparencyTitle")}
          hint={ta("themeTransparencyHint")}
          control={
            <Switch
              id="account-theme-transparency"
              checked={appearance.transparency}
              onCheckedChange={(v) => void changeTransparency(v)}
            />
          }
        />
      </SettingsGroup>

      {/* Keyboard — only one setting for now, but a subject of its own: the
          send gesture is neither an appearance nor a ticket property. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountKeyboard}
        title={ta("keyboardSectionTitle")}
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

    </>
  );
}
