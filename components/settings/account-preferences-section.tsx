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
  Separator,
  useTheme,
  cn,
  toast,
} from "mangue-ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { setLocaleCookie } from "@/lib/set-locale";
import { locales, type Locale } from "@/i18n/config";
import { SettingsSection } from "@/components/settings-shell";

const LANGUAGE_LABELS: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};

type ThemeValue = "light" | "dark" | "system";

/** Language + theme. Both persist to the account (locale to `user_metadata`,
    theme to the local next-themes store). */
export function AccountPreferencesSection() {
  const ta = useTranslations("Account");
  const tLang = useTranslations("Language");
  const tNav = useTranslations("Nav");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [switchingLocale, setSwitchingLocale] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Theme is only known client-side; wait for mount before highlighting so the
  // active option doesn't mismatch during hydration.
  useEffect(() => setMounted(true), []);

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

  const themeOptions: { value: ThemeValue; icon: typeof Sun; label: string }[] =
    [
      { value: "light", icon: Sun, label: tNav("themeLight") },
      { value: "dark", icon: Moon, label: tNav("themeDark") },
      { value: "system", icon: Monitor, label: tNav("themeSystem") },
    ];

  return (
    <>
      <SettingsSection title={tLang("title")} description={tLang("subtitle")}>
        <Select
          value={currentLocale}
          onValueChange={(value) => void switchLocale(value as Locale)}
          disabled={switchingLocale}
        >
          <SelectTrigger id="account-language" className="max-w-sm">
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
      </SettingsSection>

      <Separator />

      <SettingsSection title={ta("themeTitle")} description={ta("themeDesc")}>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {themeOptions.map((o) => {
            const active = mounted && theme === o.value;
            const Icon = o.icon;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {o.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>
    </>
  );
}
