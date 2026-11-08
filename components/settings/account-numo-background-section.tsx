"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { NUMO_MEMORY_META_KEY, resolveNumoMemoryEnabled } from "@/lib/numo-memory";
import { NUMO_BACKGROUND_META_KEY, resolveNumoBackgroundEnabled } from "@/lib/numo-background";

/**
 * Account → AI & Numo → Numo in the background (MIN-929). The switch needs
 * Numo's memory: the memories hold the instructions and the permissions a
 * background turn follows, so with the memory off it is shown off and
 * cannot be turned on.
 */
export function AccountNumoBackgroundSection() {
  const t = useTranslations("Account");
  const [memory] = useAccountPreference(NUMO_MEMORY_META_KEY, resolveNumoMemoryEnabled);
  const [enabled, setEnabled, ready] = useAccountPreference(
    NUMO_BACKGROUND_META_KEY,
    resolveNumoBackgroundEnabled,
  );

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountNumoBackground}
      title={t("numoBackgroundTitle")}
      help={t("numoBackgroundHelp")}
      action={
        <Switch
          aria-label={t("numoBackgroundSwitch")}
          checked={enabled}
          onCheckedChange={(next) => void setEnabled(next)}
          disabled={!ready || !memory}
        />
      }
    >
      {ready && !memory ? (
        <SettingsEmpty>{t("numoBackgroundNeedsMemory")}</SettingsEmpty>
      ) : null}
    </SettingsGroup>
  );
}
