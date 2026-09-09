"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from "mangue-ui";
import { Server } from "lucide-react";
import { SettingsEmpty, SettingsGroup, SettingsRow } from "./settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { saveAgentPreferencesApi } from "@/lib/agent-keys-api";
import { agentPreferencesQueryKey, useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { isSandboxRegion, isSandboxSize, SANDBOX_RESOURCES, SANDBOX_SIZES, sandboxUsagePercentPerHour, type SandboxPreferences } from "@/lib/agent-sandbox-config";
import { useBillingSummary } from "@/lib/use-billing-query";

export function AccountSandboxSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { sandbox_region, sandbox_size, loading, error } = useAgentPreferencesQuery();
  const [saving, setSaving] = useState(false);
  const billing = useBillingSummary();
  const hourlyPercent = billing.usage
    ? sandboxUsagePercentPerHour({ sandbox_region, sandbox_size }, billing.includedUsd)
    : null;
  const formattedPercent = hourlyPercent === null ? null : new Intl.NumberFormat(locale, {
    style: "percent", maximumFractionDigits: 2,
  }).format(hourlyPercent / 100);

  const save = async (patch: Partial<SandboxPreferences>) => {
    setSaving(true);
    try {
      await saveAgentPreferencesApi(patch);
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("sandboxSavedToast"));
    } catch {
      toast.error(t("sandboxSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountSandbox}
      icon={Server}
      title={t("sandboxTitle")}
      description={t("sandboxDesc")}
      action={<Badge variant="secondary">{t("sandboxExperimental")}</Badge>}
    >
      {loading ? <SettingsEmpty>{tc("loading")}</SettingsEmpty> : error ? (
        <SettingsEmpty>{t("sandboxLoadError")}</SettingsEmpty>
      ) : (
        <>
          <SettingsRow
            htmlFor="sandbox-region"
            label={t("sandboxRegionLabel")}
            control={
              <Select value={sandbox_region} disabled={saving} onValueChange={(value) => {
                if (isSandboxRegion(value)) void save({ sandbox_region: value });
              }}>
                <SelectTrigger id="sandbox-region" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu">{t("sandboxRegionEurope")}</SelectItem>
                  <SelectItem value="us">{t("sandboxRegionUs")}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            htmlFor="sandbox-size"
            label={t("sandboxSizeLabel")}
            control={
              <Select value={sandbox_size} disabled={saving} onValueChange={(value) => {
                if (isSandboxSize(value)) void save({ sandbox_size: value });
              }}>
                <SelectTrigger id="sandbox-size" className="w-full whitespace-normal data-[size=default]:h-auto data-[size=default]:md:h-auto sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SANDBOX_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      <span className="flex flex-col gap-0.5 text-left">
                        <span>{t(size === "standard" ? "sandboxStandard" : "sandboxPerformance")}</span>
                        <span className="text-xs text-muted-foreground">{t("sandboxSpecs", {
                          vcpus: SANDBOX_RESOURCES[size].vcpus,
                          memory: SANDBOX_RESOURCES[size].memoryMb / 1024,
                        })}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          >
            <div className="rounded-lg bg-muted/50 px-3 py-2.5" role="status">
              <p className="text-sm font-medium">
                {billing.loading ? tc("loading") : formattedPercent !== null
                  ? t("sandboxHourlyUsage", { percent: formattedPercent })
                  : t("sandboxEstimateUnavailable")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("sandboxHourlyUsageHint")}</p>
            </div>
          </SettingsRow>
        </>
      )}
    </SettingsGroup>
  );
}
