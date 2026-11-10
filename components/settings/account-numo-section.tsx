"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusIndicator } from "@/components/issue-indicators";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { NUMO_MEMORY_META_KEY, resolveNumoMemoryEnabled } from "@/lib/numo-memory";
import { NUMO_BACKGROUND_META_KEY, resolveNumoBackgroundEnabled } from "@/lib/numo-background";
import {
  NUMO_DEFAULT_STATUS_OPTIONS,
  resolveNumoDefaultStatus,
  type NumoDefaultStatus,
} from "@/lib/numo-default-status";

/**
 * Account → Numo (MIN-954): how Numo works for this account, in one card:
 * whether it remembers, whether it works in the background, and where the
 * issues it creates land. Its provider and model live in the AI tab.
 */
export function AccountNumoSection() {
  const t = useTranslations("Account");
  const tStatus = useTranslations("Status");
  const [memory, setMemory, memoryReady] = useAccountPreference(
    NUMO_MEMORY_META_KEY,
    resolveNumoMemoryEnabled,
  );
  const [background, setBackground, backgroundReady] = useAccountPreference(
    NUMO_BACKGROUND_META_KEY,
    resolveNumoBackgroundEnabled,
  );
  const [status, setStatus, statusReady] = useAccountPreference<NumoDefaultStatus>(
    "numo_default_status",
    resolveNumoDefaultStatus,
  );

  return (
    <SettingsGroup anchor={SETTINGS_SECTIONS.accountNumo} title={t("numoGeneralTitle")}>
      <SettingsRow
        label={t("numoMemoryTitle")}
        hint={t("numoMemorySwitchHint")}
        help={t("numoMemoryHelp")}
        control={
          <Switch
            aria-label={t("numoMemorySwitch")}
            checked={memory}
            onCheckedChange={(next) => void setMemory(next)}
            disabled={!memoryReady}
          />
        }
      />
      <SettingsRow
        anchor={SETTINGS_SECTIONS.accountNumoBackground}
        label={t("numoBackgroundTitle")}
        hint={memoryReady && !memory ? t("numoBackgroundNeedsMemory") : t("numoBackgroundHint")}
        help={t("numoBackgroundHelp")}
        control={
          <Switch
            aria-label={t("numoBackgroundSwitch")}
            checked={background && memory}
            onCheckedChange={(next) => void setBackground(next)}
            disabled={!backgroundReady || !memory}
          />
        }
      />
      <SettingsRow
        anchor={SETTINGS_SECTIONS.accountNumoStatus}
        htmlFor="account-numo-status"
        label={t("numoStatusTitle")}
        hint={t("numoStatusDesc")}
        control={
          <Select
            value={status}
            onValueChange={(value) => void setStatus(value as NumoDefaultStatus)}
            disabled={!statusReady}
          >
            <SelectTrigger id="account-numo-status" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NUMO_DEFAULT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  <span className="flex items-center gap-2">
                    <StatusIndicator status={option} className="size-4" />
                    {tStatus(option)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingsGroup>
  );
}
