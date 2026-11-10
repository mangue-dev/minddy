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
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useNumoPreferencesQuery, useSaveNumoPreferences } from "@/lib/use-numo-preferences-query";
import { useAiRoutesQuery, useSetAiRoute } from "@/lib/use-ai-routes-query";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { updateAiKeyPreferencesApi, type AiKey } from "@/lib/agent-keys-api";
import {
  MINDDY_CLOUD_PROVIDER,
  ROLE_USAGE_KEYS,
  type AiModelRole,
  type AiProviderChoice,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { modelCatalogCapabilityForKey } from "@/lib/model-catalog-capability";

/**
 * Minddy's AI settings: the providers the account can use, then a provider
 * for each model ROLE (MIN-954) — the language model that Numo and every
 * text feature run, the embedding model, and speech to text. No feature
 * chooses a provider or a model of its own. Choices apply at once and roll
 * back if the server refuses them.
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
        <LanguageModelRow />
        <RoleRow role="embedding" />
        <RoleRow role="transcription" />
      </SettingsGroup>
    </section>
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
    return <span className="flex h-9 items-center text-sm sm:justify-end"><ProviderOptionLabel option={current} /></span>;
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

/**
 * The language model (MIN-954): its provider, then that provider's model,
 * which Numo and every text feature run. The instance's provider runs the
 * administrator's model, so only a personal key offers a model.
 */
function LanguageModelRow() {
  const t = useTranslations("Account");
  const modelCopy = useModelCopy();
  const preferences = useNumoPreferencesQuery();
  const save = useSaveNumoPreferences(() => toast.error(t("numoModelSaveError")));
  const data = preferences.data;
  const provider = data?.provider ?? MINDDY_CLOUD_PROVIDER;
  const label = t("aiRole_llm");
  return (
    <SettingsRow
      label={label}
      hint={t("aiRoleHint_llm")}
      control={
        <UsageControls
          provider={<ProviderSelect value={provider} options={data?.providers ?? []}
            ariaLabel={t("aiUsageProvider", { usage: label })} disabled={!data}
            onChange={(next) => save.mutate({ provider: next, default_model: null })} />}
          model={data?.model_locked ? undefined : <ModelCombobox scope="assistant" providerChoice={provider}
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

/** Embeddings or speech to text: a provider, and a key's model for it. */
function RoleRow({ role }: { role: Exclude<AiModelRole, "llm"> }) {
  const usageKey = ROLE_USAGE_KEYS[role];
  const t = useTranslations("Account");
  const routes = useAiRoutesQuery();
  const { keys } = useAiKeysQuery();
  const setRoute = useSetAiRoute(() => toast.error(t("aiUsageSaveError")));
  const provider = routes.data?.routes[usageKey] ?? MINDDY_CLOUD_PROVIDER;
  const key = provider === MINDDY_CLOUD_PROVIDER ? undefined : keys.find((entry) => entry.provider === provider);
  const label = t(`aiRole_${role}`);
  return (
    <SettingsRow
      label={label}
      hint={t(`aiRoleHint_${role}`)}
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
