"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { ProviderOptionLabel } from "@/components/ai-provider-label";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useNumoPreferencesQuery, useSaveNumoPreferences } from "@/lib/use-numo-preferences-query";
import { useAiRoutesQuery, useSetAiRoute } from "@/lib/use-ai-routes-query";
import { useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { updateAiKeyPreferencesApi, type AiKey } from "@/lib/agent-keys-api";
import { useQueryClient } from "@tanstack/react-query";
import { aiKeysQueryKey } from "@/lib/use-ai-keys-query";
import {
  AI_SURFACE_DEFINITIONS,
  MINDDY_CLOUD_PROVIDER,
  type AiProviderChoice,
  type ByokModelKey,
  type RoutedAiSurface,
} from "@/lib/ai-surfaces";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { modelCatalogCapabilityForKey, providerSupportsModelKey } from "@/lib/model-catalog-capability";
import { isKnownAgentProvider } from "@/lib/agent-providers";

/**
 * Minddy's AI settings (MIN-826): the providers the account can use, then
 * one provider per usage. Every usage is independent, so Numo can run on a
 * personal key while everything else stays on minddy Cloud. Choices apply at
 * once and roll back if the server refuses them.
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
      <SettingsGroup anchor={SETTINGS_SECTIONS.accountAiUsages} title={t("aiUsagesTitle")}>
        <NumoUsageRow />
        {(["automations", "voice", "feedback"] as const).map((surface) => (
          <UsageRow key={surface} surface={surface} />
        ))}
      </SettingsGroup>
    </section>
  );
}

/** Provider choice for a usage; a single option is shown as plain text. */
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
      <SelectTrigger className="w-full sm:w-72" aria-label={ariaLabel}>
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

function useUsageCopy() {
  const t = useTranslations("Account");
  return {
    label: (surface: RoutedAiSurface) => t(`aiUsage_${surface}`),
    hint: (surface: RoutedAiSurface) => t(`aiUsageHint_${surface}`),
    fallback: (option: AiProviderOption | undefined) => option && option.fallbackCapabilities.length > 0
      ? t("aiUsageFallback", {
        capabilities: option.fallbackCapabilities
          .map((capability) => t(`aiCapabilityShort_${capability}` as "aiCapabilityShort_embedding"))
          .join(", "),
      })
      : null,
  };
}

/** Numo: provider, then that provider's default model. */
function NumoUsageRow() {
  const t = useTranslations("Account");
  const ta = useTranslations("Agent");
  const copy = useUsageCopy();
  const preferences = useNumoPreferencesQuery();
  const save = useSaveNumoPreferences(() => toast.error(t("numoModelSaveError")));
  const data = preferences.data;
  const provider = data?.provider ?? MINDDY_CLOUD_PROVIDER;
  const option = data?.providers.find((entry) => entry.id === provider);
  return (
    <SettingsRow
      label={copy.label("assistant")}
      hint={copy.fallback(option) ?? copy.hint("assistant")}
      control={
        <div className="flex w-full flex-col gap-2 sm:w-72">
          <ProviderSelect value={provider} options={data?.providers ?? []}
            ariaLabel={t("aiUsageProvider", { usage: copy.label("assistant") })}
            disabled={!data}
            onChange={(next) => save.mutate({ provider: next, default_model: null })} />
          <div className="w-full">
            <ModelCombobox scope="assistant" providerChoice={provider}
              value={data?.default_model ?? ""}
              onChange={(value) => data && save.mutate({ provider, default_model: value || null })}
              disabled={!data}
              defaultLabel={t("numoApplicationDefault")} defaultModelId={data?.application_model}
              placeholder={ta("modelSearchPlaceholder")} emptyLabel={ta("modelSearchEmpty")}
              loadingLabel={ta("modelSearchLoading")} freeTextLabel={(model) => ta("modelUseCustom", { model })}
              ariaLabel={t("numoDefaultModel")} />
          </div>
        </div>
      }
    >
      {/* A failed background refresh keeps the loaded preference usable, as
          every other read does; only a preference that never loaded is an error. */}
      {preferences.error && !data && <p role="alert" className="py-2 text-sm text-destructive">{t("numoModelLoadError")}</p>}
    </SettingsRow>
  );
}

/** Automations, voice and feedback: a provider, and a key's detailed models on demand. */
function UsageRow({ surface }: { surface: Exclude<RoutedAiSurface, "assistant"> }) {
  const t = useTranslations("Account");
  const copy = useUsageCopy();
  const routes = useAiRoutesQuery();
  const { keys } = useAiKeysQuery();
  const setRoute = useSetAiRoute(() => toast.error(t("aiUsageSaveError")));
  const [open, setOpen] = useState(false);
  const provider = routes.data?.routes[surface] ?? MINDDY_CLOUD_PROVIDER;
  const options = routes.data?.options[surface] ?? [];
  const option = options.find((entry) => entry.id === provider);
  const key = provider === MINDDY_CLOUD_PROVIDER ? undefined : keys.find((entry) => entry.provider === provider);
  const modelKeys = key ? surfaceModelKeys(surface, key) : [];
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <SettingsRow
        label={copy.label(surface)}
        hint={copy.fallback(option) ?? copy.hint(surface)}
        control={
          <div className="flex items-center gap-1">
            <ProviderSelect value={provider} options={options}
              ariaLabel={t("aiUsageProvider", { usage: copy.label(surface) })}
              disabled={!routes.data}
              onChange={(next) => { setOpen(false); setRoute.mutate({ surface, provider: next }); }} />
            {modelKeys.length > 0 && (
              <Button type="button" variant="ghost" size="icon" aria-expanded={open}
                aria-label={t("aiUsageModels", { usage: copy.label(surface) })}
                onClick={() => setOpen((value) => !value)}>
                <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-4 transition-transform", open && "rotate-180")} />
              </Button>
            )}
          </div>
        }
      />
      {open && key && <KeyModels aiKey={key} modelKeys={modelKeys} />}
    </div>
  );
}

function surfaceModelKeys(surface: RoutedAiSurface, key: AiKey): ByokModelKey[] {
  const definition = AI_SURFACE_DEFINITIONS.find((entry) => entry.id === surface);
  if (!definition || !isKnownAgentProvider(key.provider)) return [];
  return definition.modelKeys.filter((modelKey) => providerSupportsModelKey(key.provider, modelKey));
}

/** The model of each call type a key serves for a usage, saved optimistically. */
function KeyModels({ aiKey, modelKeys }: { aiKey: AiKey; modelKeys: ByokModelKey[] }) {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tAdmin = useTranslations("Admin");
  const queryClient = useQueryClient();
  const saveModel = async (modelKey: ByokModelKey, model: string) => {
    const previous = queryClient.getQueryData<{ keys: AiKey[] }>(aiKeysQueryKey);
    const featureModels = { ...aiKey.feature_models, [modelKey]: model };
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
    <ModelsPanel>
      {modelKeys.map((modelKey) => (
        <SettingsRow key={modelKey} label={tAdmin(`fields.${modelKey}.label` as never)}
          control={
            <div className="w-full sm:w-64">
              <ModelCombobox scope="byok" providerChoice={aiKey.provider}
                capability={modelCatalogCapabilityForKey(modelKey)}
                value={aiKey.feature_models[modelKey] ?? ""}
                onChange={(value) => void saveModel(modelKey, value)}
                defaultLabel={t("byokModelDefault")}
                defaultModelId={aiKey.resolved_feature_models?.[modelKey] ?? null}
                placeholder={tAgent("modelSearchPlaceholder")} emptyLabel={tAgent("modelSearchEmpty")}
                loadingLabel={tAgent("modelSearchLoading")}
                freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })} />
            </div>
          } />
      ))}
    </ModelsPanel>
  );
}

function ModelsPanel({ children }: { children: ReactNode }) {
  return <div className="mb-3 ml-4 border-l border-border/70 pl-4">{children}</div>;
}
