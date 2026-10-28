"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { ProviderOptionLabel } from "@/components/ai-provider-label";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/lib/settings-sections";
import { useNumoPreferencesQuery, useSaveNumoPreferences } from "@/lib/use-numo-preferences-query";
import { useAiRoutesQuery, useSetAiRoute } from "@/lib/use-ai-routes-query";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { updateAiKeyPreferencesApi, type AiKey } from "@/lib/agent-keys-api";
import {
  AI_SURFACE_DEFINITIONS,
  MINDDY_CLOUD_PROVIDER,
  ROUTED_AI_SURFACES,
  type AiProviderChoice,
  type ByokModelKey,
  type RoutedAiSurface,
} from "@/lib/ai-surfaces";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { modelCatalogCapabilityForKey } from "@/lib/model-catalog-capability";

/**
 * Minddy's AI settings (MIN-826): the providers the account can use, then a
 * provider for every precise usage, grouped as Numo, automations, voice and
 * feedback. Each call type is independent, so Numo conversations can run on a
 * personal key while their titles and everything else stay on minddy Cloud.
 * Choices apply at once and roll back if the server refuses them.
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  return (
    <section aria-labelledby="minddy-ai-title" className="space-y-5">
      <header className="space-y-1">
        <h2 id="minddy-ai-title" className="text-base font-semibold">{t("aiGeneralTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("aiGeneralDescription")}</p>
      </header>
      <SettingsGroup anchor={SETTINGS_SECTIONS.accountAiProvider}
        title={t("aiConnectedProviders")} variant="block">
        <ByokConnectPanel mode="settings" />
      </SettingsGroup>
      <UsageGroup surface="assistant" anchor={SETTINGS_SECTIONS.accountAiUsages} />
      {ROUTED_AI_SURFACES.filter((surface) => surface !== "assistant").map((surface) => (
        <UsageGroup key={surface} surface={surface} />
      ))}
    </section>
  );
}

function usageKeysOf(surface: RoutedAiSurface): readonly ByokModelKey[] {
  return AI_SURFACE_DEFINITIONS.find((entry) => entry.id === surface)?.modelKeys ?? [];
}

/** One category of usages: a row per call type. */
function UsageGroup({ surface, anchor }: { surface: RoutedAiSurface; anchor?: SettingsSectionId }) {
  const t = useTranslations("Account");
  return (
    <SettingsGroup anchor={anchor} title={t(`aiUsage_${surface}`)}>
      {usageKeysOf(surface).map((usageKey) => usageKey === "assistant_model"
        ? <NumoConversationsRow key={usageKey} />
        : <UsageRow key={usageKey} usageKey={usageKey} />)}
    </SettingsGroup>
  );
}

/** Provider choice for a call type; a single option is shown as plain text. */
function ProviderSelect({ value, options, onChange, ariaLabel, disabled }: {
  value: AiProviderChoice;
  options: AiProviderOption[];
  onChange: (value: AiProviderChoice) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const current = options.find((option) => option.id === value) ?? { id: value, label: value };
  if (options.length <= 1) {
    return <span className="flex h-9 items-center text-sm"><ProviderOptionLabel option={current} /></span>;
  }
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AiProviderChoice)} disabled={disabled}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}>
        <SelectValue><ProviderOptionLabel option={current} /></SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}><ProviderOptionLabel option={option} /></SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The row's controls: the provider, then the model when one can be chosen. */
function UsageControls({ provider, model }: { provider: ReactNode; model?: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-72">
      {provider}
      {model}
    </div>
  );
}

function useModelCopy() {
  const ta = useTranslations("Agent");
  return {
    placeholder: ta("modelSearchPlaceholder"),
    emptyLabel: ta("modelSearchEmpty"),
    loadingLabel: ta("modelSearchLoading"),
    freeTextLabel: (model: string) => ta("modelUseCustom", { model }),
  };
}

/** Numo conversations: provider, then that provider's default model. */
function NumoConversationsRow() {
  const t = useTranslations("Account");
  const modelCopy = useModelCopy();
  const preferences = useNumoPreferencesQuery();
  const save = useSaveNumoPreferences(() => toast.error(t("numoModelSaveError")));
  const data = preferences.data;
  const provider = data?.provider ?? MINDDY_CLOUD_PROVIDER;
  const label = t("aiUsageKey_assistant_model");
  return (
    <SettingsRow
      label={label}
      hint={t("aiUsageKeyHint_assistant_model")}
      control={
        <UsageControls
          provider={<ProviderSelect value={provider} options={data?.providers ?? []}
            ariaLabel={t("aiUsageProvider", { usage: label })} disabled={!data}
            onChange={(next) => save.mutate({ provider: next, default_model: null })} />}
          model={<ModelCombobox scope="assistant" providerChoice={provider}
            value={data?.default_model ?? ""}
            onChange={(value) => data && save.mutate({ provider, default_model: value || null })}
            disabled={!data}
            defaultLabel={t("numoApplicationDefault")} defaultModelId={data?.application_model}
            {...modelCopy} ariaLabel={t("numoDefaultModel")} />}
        />
      }
    >
      {/* A failed background refresh keeps the loaded preference usable, as
          every other read does; only a preference that never loaded is an error. */}
      {preferences.error && !data && <p role="alert" className="py-2 text-sm text-destructive">{t("numoModelLoadError")}</p>}
    </SettingsRow>
  );
}

/** Any other call type: a provider, and a key's model for it. */
function UsageRow({ usageKey }: { usageKey: Exclude<ByokModelKey, "assistant_model"> }) {
  const t = useTranslations("Account");
  const routes = useAiRoutesQuery();
  const { keys } = useAiKeysQuery();
  const setRoute = useSetAiRoute(() => toast.error(t("aiUsageSaveError")));
  const provider = routes.data?.routes[usageKey] ?? MINDDY_CLOUD_PROVIDER;
  const key = provider === MINDDY_CLOUD_PROVIDER ? undefined : keys.find((entry) => entry.provider === provider);
  const label = t(`aiUsageKey_${usageKey}`);
  return (
    <SettingsRow
      label={label}
      hint={t(`aiUsageKeyHint_${usageKey}`)}
      control={
        <UsageControls
          provider={<ProviderSelect value={provider} options={routes.data?.options[usageKey] ?? []}
            ariaLabel={t("aiUsageProvider", { usage: label })} disabled={!routes.data}
            onChange={(next) => setRoute.mutate({ usage: usageKey, provider: next })} />}
          model={key ? <KeyModel aiKey={key} usageKey={usageKey} label={label} /> : undefined}
        />
      }
    />
  );
}

/** The model a key runs for one call type, saved optimistically. */
function KeyModel({ aiKey, usageKey, label }: { aiKey: AiKey; usageKey: ByokModelKey; label: string }) {
  const t = useTranslations("Account");
  const modelCopy = useModelCopy();
  const queryClient = useQueryClient();
  const saveModel = async (model: string) => {
    const previous = queryClient.getQueryData<{ keys: AiKey[] }>(aiKeysQueryKey);
    const featureModels = { ...aiKey.feature_models, [usageKey]: model };
    queryClient.setQueryData<{ keys: AiKey[] }>(aiKeysQueryKey, (data) => data && {
      keys: data.keys.map((entry) => entry.id === aiKey.id ? { ...entry, feature_models: featureModels } : entry),
    });
    try {
      await updateAiKeyPreferencesApi({ key_id: aiKey.id, feature_models: featureModels });
    } catch {
      if (previous) queryClient.setQueryData(aiKeysQueryKey, previous);
      toast.error(t("aiUsageSaveError"));
    } finally {
      void queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
    }
  };
  return (
    <ModelCombobox scope="byok" providerChoice={aiKey.provider}
      capability={modelCatalogCapabilityForKey(usageKey)}
      value={aiKey.feature_models[usageKey] ?? ""}
      onChange={(value) => void saveModel(value)}
      defaultLabel={t("byokModelDefault")}
      defaultModelId={aiKey.resolved_feature_models?.[usageKey] ?? null}
      {...modelCopy} ariaLabel={t("aiUsageModel", { usage: label })} />
  );
}
