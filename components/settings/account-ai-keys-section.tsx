"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from "mangue-ui";

import {
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { formatModelName } from "@/lib/model-display";
import { ProviderLogo } from "@/components/model-logo";
import { numoPreferencesQueryKey, saveNumoPreferencesApi, useNumoPreferencesQuery } from "@/lib/use-numo-preferences-query";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { AccountSandboxSection } from "./account-sandbox-section";
import { NativeAgentConnections } from "./native-agent-connections";
import { NativeAgentModelPreferences } from "./native-agent-model-preferences";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import {
  assignAiCapabilityApi,
  saveAgentPreferencesApi,
  saveAgentEnginePreferenceApi,
  updateAiKeyPreferencesApi,
} from "@/lib/agent-keys-api";
import type { AiKey, AccountAgentEngine } from "@/lib/agent-keys-api";
import {
  agentModelsQueryKey,
  useAgentModelsQuery,
  useReasoningLevelsFor,
} from "@/lib/use-agent-models-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";
import { nearestReasoningLevel } from "@/lib/agent-reasoning";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { AI_SURFACE_DEFINITIONS } from "@/lib/ai-surfaces";
import type { AiSurface, ByokModelKey } from "@/lib/ai-surfaces";
import { getAgentProvider, isLocalAgentProvider } from "@/lib/agent-providers";
import {
  MODEL_CATALOG_CAPABILITIES,
  modelCatalogCapabilityForKey,
} from "@/lib/model-catalog-capability";
import type { ModelCatalogCapability } from "@/lib/model-catalog-capability";

/** General Minddy AI routing and separate code-worker execution settings. */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const textKey = keys.find((key) =>
    key.assigned_capabilities.includes("text"),
  );

  const {
    defaultEngine,
    nativeAgentsEnabled,
    nativeModelPreferences,
    defaultModel,
    defaultReasoningLevel,
    loading: prefLoading,
  } = useAgentPreferencesQuery();
  const usesOpenCode = defaultEngine === "opencode";
  const usesCodeKey = Boolean(textKey?.enabled_surfaces.includes("agent"));
  const codeProviderLabel = usesCodeKey && textKey
    ? getAgentProvider(textKey.provider)?.label ?? textKey.provider
    : t("aiProviderMinddy");
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const reasoningLevels = useReasoningLevelsFor(
    defaultModel || providerDefaultModel,
  );

  const onModelChange = async (value: string) => {
    if (!value) return;
    try {
      await saveAgentPreferencesApi({ default_model: value });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      ]);
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onReasoningChange = async (value: ReasoningLevel) => {
    try {
      await saveAgentPreferencesApi({ default_reasoning_level: value });
      await queryClient.invalidateQueries({
        queryKey: agentPreferencesQueryKey,
      });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onEngineChange = async (engine: AccountAgentEngine) => {
    await saveAgentEnginePreferenceApi(engine);
    await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
  };

  const onCodeFundingChange = async (value: string) => {
    if (!textKey || (value !== "minddy" && value !== textKey.id)) return;
    try {
      const surfaces = textKey.enabled_surfaces.filter((surface) => surface !== "agent");
      await updateAiKeyPreferencesApi({
        key_id: textKey.id,
        enabled_surfaces: value === "minddy" ? surfaces : [...surfaces, "agent"],
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
      ]);
      toast.success(t("agentModelSavedToast"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <>
      <section aria-labelledby="minddy-ai-title" className="space-y-5">
        <header className="space-y-1">
          <h2 id="minddy-ai-title" className="text-base font-semibold">{t("aiGeneralTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("aiGeneralDescription")}</p>
        </header>
        <SettingsGroup anchor={SETTINGS_SECTIONS.accountAiProvider}
          title={t("aiProviderTitle")} variant="block">
          <ByokCapabilityAssignments keys={keys} capabilities={["text"]} />
          <NumoModelPreference />
          <ByokConnectPanel mode="settings" />
        </SettingsGroup>
        {keys.length > 0 ? <SettingsGroup title={t("byokRoutingTitle")}><ByokCapabilityAssignments keys={keys} capabilities={MODEL_CATALOG_CAPABILITIES.filter((capability) => capability !== "text")} /></SettingsGroup> : null}
        {keys.filter((key) => key.assigned_capabilities.length > 0).map((key) => (
          <ByokSurfacePreferences key={key.id} aiKey={key}
            providerDefaultModel={providerDefaultModel} />
        ))}
      </section>

      <NativeAgentConnections defaultEngine={defaultEngine}
        nativeAgentsEnabled={nativeAgentsEnabled} preferenceLoading={prefLoading}
        onEngineChange={onEngineChange} openCodeProviderLabel={codeProviderLabel}>
        {usesOpenCode && <>
          <SettingsRow label={t("codeAgentFundingTitle")} hint={t("codeAgentFundingHint")}
            control={textKey ? <Select value={usesCodeKey ? textKey.id : "minddy"}
              disabled={keysLoading} onValueChange={(value) => void onCodeFundingChange(value)}>
              <SelectTrigger className="w-56" aria-label={t("codeAgentFundingTitle")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minddy">{t("aiProviderMinddy")}</SelectItem>
                <SelectItem value={textKey.id}>{getAgentProvider(textKey.provider)?.label ?? textKey.provider}</SelectItem>
              </SelectContent>
            </Select> : <span className="text-sm">{t("aiProviderMinddy")}</span>} />
          <AgentPreferenceRows loading={prefLoading} loadingLabel={tc("loading")}
            defaultModel={defaultModel} defaultReasoningLevel={defaultReasoningLevel}
            providerDefaultModel={providerDefaultModel} reasoningLevels={reasoningLevels}
            onModelChange={onModelChange} onReasoningChange={onReasoningChange} />
        </>}
        {!usesOpenCode && <NativeAgentModelPreferences key={defaultEngine}
          engine={defaultEngine} enabled={nativeAgentsEnabled} loading={prefLoading}
          preference={nativeModelPreferences[defaultEngine]} />}
        <AccountSandboxSection embedded />
      </NativeAgentConnections>
    </>
  );
}

export function NumoModelPreference() {
  const t = useTranslations("Account");
  const ta = useTranslations("Agent");
  const queryClient = useQueryClient();
  const preferences = useNumoPreferencesQuery();
  const [saving, setSaving] = useState(false);
  const save = async (value: string) => {
    if (!preferences.data || saving) return;
    setSaving(true);
    try {
      await saveNumoPreferencesApi({ provider: preferences.data.provider, default_model: value || null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: numoPreferencesQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      ]);
      toast.success(t("agentModelSavedToast"));
    } catch {
      toast.error(t("numoModelSaveError"));
    } finally { setSaving(false); }
  };
  return <SettingsRow label={t("numoDefaultModel")} hint={t("numoDefaultModelHint")}
    control={<ModelCombobox scope="assistant" value={preferences.data?.default_model ?? ""}
      onChange={(value) => void save(value)} disabled={preferences.isPending || saving || !preferences.data}
      defaultLabel={t("numoApplicationDefault")} defaultModelId={preferences.data?.application_model}
      placeholder={ta("modelSearchPlaceholder")} emptyLabel={ta("modelSearchEmpty")}
      loadingLabel={ta("modelSearchLoading")} freeTextLabel={(model) => ta("modelUseCustom", { model })}
      variant="compact" ariaLabel={t("numoDefaultModel")}
      triggerContent={<span className="truncate">{preferences.data?.default_model
        ? formatModelName(preferences.data.default_model) : t("numoApplicationDefault")}</span>}
      triggerClassName="h-9 w-72 max-w-full justify-between rounded-lg border border-border bg-card px-3 text-sm" />}>
    {preferences.error && <p role="alert" className="py-2 text-sm text-destructive">{t("numoModelLoadError")}</p>}
  </SettingsRow>;
}

function ByokCapabilityAssignments({ keys, capabilities }: { keys: AiKey[]; capabilities: readonly ModelCatalogCapability[] }) {
  const t = useTranslations("Account");
  const queryClient = useQueryClient();
  const assignedKey = (capability: ModelCatalogCapability) =>
    keys.find((key) => key.assigned_capabilities.includes(capability));
  const saveAssignment = async (
    capability: ModelCatalogCapability,
    keyId: string,
  ) => {
    try {
      await assignAiCapabilityApi(
        capability,
        keyId === "minddy" ? null : keyId,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
        queryClient.invalidateQueries({ queryKey: numoPreferencesQueryKey }),
      ]);
      toast.success(t("agentModelSavedToast"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div>
      {capabilities.map((capability) => (
        <SettingsRow
          key={capability}
          label={capability === "text" ? t("aiProviderTitle") : t(`byokCapability_${capability}`)}
          hint={t("byokRoutingHint")}
          control={
            <Select
              value={assignedKey(capability)?.id ?? "minddy"}
              onValueChange={(value) => void saveAssignment(capability, value)}
            >
              <SelectTrigger className="w-72 max-w-full" aria-label={capability === "text" ? t("aiProviderTitle") : t(`byokCapability_${capability}`)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minddy">{t("aiProviderMinddy")}</SelectItem>
                {keys
                  .filter((key) =>
                    key.supported_capabilities.includes(capability),
                  )
                  .map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      <span className="inline-flex items-center gap-2"><ProviderLogo provider={key.provider} size={16} />{getAgentProvider(key.provider)?.label ?? key.provider}</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          }
        />
      ))}
    </div>
  );
}

function capabilitiesForSurface(
  surface: (typeof AI_SURFACE_DEFINITIONS)[number],
): ModelCatalogCapability[] {
  if (surface.id === "agent") return ["text"];
  return [...new Set(surface.modelKeys.map(modelCatalogCapabilityForKey))];
}

/** Areas covered by the key and explicit model of each type of call. */
function ByokSurfacePreferences({
  aiKey: key,
  providerDefaultModel,
}: {
  aiKey: AiKey;
  providerDefaultModel: string | null;
}) {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tAdmin = useTranslations("Admin");
  const queryClient = useQueryClient();
  const visibleSurfaces = AI_SURFACE_DEFINITIONS.filter(
    (surface) =>
      surface.id !== "agent" && !isLocalAgentProvider(key.provider),
  )
    .map((surface) => ({
      surface,
      assignedCapabilities: capabilitiesForSurface(surface).filter((capability) =>
        key.assigned_capabilities.includes(capability),
      ),
    }))
    .filter(({ assignedCapabilities }) => assignedCapabilities.length > 0);

  const saveSurfaces = async (surface: AiSurface, enabled: boolean) => {
    const current = key.enabled_surfaces ?? [];
    const next = enabled
      ? [...current.filter((entry) => entry !== surface), surface]
      : current.filter((entry) => entry !== surface);
    try {
      await updateAiKeyPreferencesApi({
        key_id: key.id,
        enabled_surfaces: next,
      });
      await Promise.all([queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: numoPreferencesQueryKey })]);
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveModel = async (modelKey: ByokModelKey, model: string) => {
    try {
      await updateAiKeyPreferencesApi({
        key_id: key.id,
        feature_models: { ...key.feature_models, [modelKey]: model },
      });
      await Promise.all([queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
        queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
        queryClient.invalidateQueries({ queryKey: numoPreferencesQueryKey })]);
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!visibleSurfaces.length) return null;
  return (
    <SettingsGroup
      title={`${t("byokSurfacesTitle")} · ${getAgentProvider(key.provider)?.label ?? key.provider}`}
    >
      {visibleSurfaces.map(({ surface, assignedCapabilities }) => {
        const enabled = key.enabled_surfaces.includes(surface.id);
        return (
          <div
            key={surface.id}
            className="border-b border-border/60 last:border-b-0"
          >
            <SettingsRow
              label={t(`byokSurface_${surface.id}`)}
              hint={
                enabled
                    ? t("byokSurfaceUsesKeyFor", {
                      capabilities: assignedCapabilities
                        .map((capability) => t(`byokCapability_${capability}`))
                        .join(", "),
                    })
                  : t("byokSurfaceUsesQuota")
              }
              control={
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    void saveSurfaces(surface.id, checked)
                  }
                />
              }
            />
            {enabled && surface.modelKeys.length > 0 ? (
              <div className="mb-3 ml-4 border-l border-border/70 pl-4">
                {surface.modelKeys
                  .filter((modelKey) =>
                    modelKey !== "assistant_model" && key.assigned_capabilities.includes(
                      modelCatalogCapabilityForKey(modelKey),
                    ),
                  )
                  .map((modelKey) => (
                    <SettingsRow
                      key={modelKey}
                      label={tAdmin(`fields.${modelKey}.label` as never)}
                      control={
                        <ModelCombobox
                          scope="byok"
                          capability={modelCatalogCapabilityForKey(modelKey)}
                          value={key.feature_models[modelKey] ?? ""}
                          onChange={(value) => void saveModel(modelKey, value)}
                          defaultLabel={t("byokModelDefault")}
                          defaultModelId={
                            key.resolved_feature_models?.[modelKey] ??
                            providerDefaultModel
                          }
                          placeholder={tAgent("modelSearchPlaceholder")}
                          emptyLabel={tAgent("modelSearchEmpty")}
                          loadingLabel={tAgent("modelSearchLoading")}
                          freeTextLabel={(q) =>
                            tAgent("modelUseCustom", { model: q })
                          }
                        />
                      }
                    />
                  ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </SettingsGroup>
  );
}

function AgentPreferenceRows({
  loading,
  loadingLabel,
  defaultModel,
  defaultReasoningLevel,
  providerDefaultModel,
  reasoningLevels,
  onModelChange,
  onReasoningChange,
}: {
  loading: boolean;
  loadingLabel: string;
  defaultModel: string | null;
  defaultReasoningLevel: ReasoningLevel;
  providerDefaultModel: string | null;
  reasoningLevels: ReasoningLevel[];
  onModelChange: (value: string) => Promise<void>;
  onReasoningChange: (value: ReasoningLevel) => Promise<void>;
}) {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");

  if (loading) return <SettingsEmpty>{loadingLabel}</SettingsEmpty>;
  return (
    <>
      <SettingsRow
        label={t("agentModelTitle")}
        hint={t(providerDefaultModel ? "agentModelDesc" : "agentModelRequired")}
        control={
          <ModelCombobox
            value={defaultModel ?? ""}
            onChange={(value) => void onModelChange(value)}
            allowDefault={false}
            defaultLabel={t("agentModelRoot")}
            defaultModelId={providerDefaultModel}
            placeholder={tAgent("modelSearchPlaceholder")}
            emptyLabel={tAgent("modelSearchEmpty")}
            loadingLabel={tAgent("modelSearchLoading")}
            freeTextLabel={(query) =>
              tAgent("modelUseCustom", { model: query })
            }
          />
        }
      />
      <SettingsRow
        label={t("agentReasoningTitle")}
        hint={t("agentReasoningDesc")}
        control={
          <ReasoningCombobox
            value={nearestReasoningLevel(
              defaultReasoningLevel,
              reasoningLevels,
            )}
            onChange={(value) => void onReasoningChange(value)}
            levels={reasoningLevels}
          />
        }
      />
    </>
  );
}
