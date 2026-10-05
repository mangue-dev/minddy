"use client";

import { useTranslations } from "next-intl";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/** Smart sorting is always available and uses deterministic rules. */
export function SmartTriageSection() {
  const t = useTranslations("Settings");
  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectSmartTriage}
      title={t("smartTriageTab")}
      help={t("smartTriageDescription")}
      variant="block"
    >
      <p className="text-sm text-muted-foreground">{t("smartTriageModeRulesDesc")}</p>
    </SettingsGroup>
  );
}
