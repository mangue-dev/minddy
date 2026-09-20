"use client";

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
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { AccountSandboxSection } from "./account-sandbox-section";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import {
  assignAiCapabilityApi,
  saveAgentPreferencesApi,
  updateAiKeyPreferencesApi,
} from "@/lib/agent-keys-api";
import type { AiKey } from "@/lib/agent-keys-api";
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

/**
 * “Code agent” section of account settings (MIN-46): the provider and
 * key first, default model second, reasoning last.
 * Each provider has a border fault; OpenRouter BYOK takes over the default of
 * minddy quota (same endpoint).
 *
 * The first block lives in `ByokConnectPanel` since MIN-149: onboarding
 * proposes the same thing at the "key" stage, and two key forms would have
 * diverged at the first provider added.
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const textKey = keys.find((key) =>
    key.assigned_capabilities.includes("text"),
  );

  const {
    defaultModel,
    defaultReasoningLevel,
    loading: prefLoading,
  } = useAgentPreferencesQuery();
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

  return (
    <>
      {/* Provider credentials come first. */}
      {/* `ByokConnectPanel` is an assistant shared with onboarding: only its
          surrounding card changes, not its contents. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountAiProvider}
        title={t("aiProviderTitle")}
        variant="block"
      >
        <ByokConnectPanel />
      </SettingsGroup>

      {keys.length > 0 ? <ByokCapabilityAssignments keys={keys} /> : null}

      {keys.filter((key) => key.assigned_capabilities.length > 0).map((key) => (
        <ByokSurfacePreferences
          key={key.id}
          aiKey={key}
          showAgentPreferences={key.id === textKey?.id}
          defaultModel={defaultModel}
          defaultReasoningLevel={defaultReasoningLevel}
          preferenceLoading={prefLoading}
          providerDefaultModel={providerDefaultModel}
          reasoningLevels={reasoningLevels}
          onModelChange={onModelChange}
          onReasoningChange={onReasoningChange}
        />
      ))}

      {/* Without BYOK, agent preferences keep their card. As soon as a
          key exists, they live in the Agent Numo row of the table above. */}
      {!keysLoading && !textKey ? (
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.accountAgent}
          title={t("agentTab")}
        >
          <AgentPreferenceRows
            loading={prefLoading}
            loadingLabel={tc("loading")}
            defaultModel={defaultModel}
            defaultReasoningLevel={defaultReasoningLevel}
            providerDefaultModel={providerDefaultModel}
            reasoningLevels={reasoningLevels}
            onModelChange={onModelChange}
            onReasoningChange={onReasoningChange}
          />
        </SettingsGroup>
      ) : null}
      <AccountSandboxSection />
    </>
  );
}

function ByokCapabilityAssignments({ keys }: { keys: AiKey[] }) {
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
      ]);
      toast.success(t("agentModelSavedToast"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <SettingsGroup title={t("byokRoutingTitle")}>
      {MODEL_CATALOG_CAPABILITIES.map((capability) => (
        <SettingsRow
          key={capability}
          label={t(`byokCapability_${capability}`)}
          hint={t("byokRoutingHint")}
          control={
            <Select
              value={assignedKey(capability)?.id ?? "minddy"}
              onValueChange={(value) => void saveAssignment(capability, value)}
            >
              <SelectTrigger className="w-56">
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
                      {getAgentProvider(key.provider)?.label ?? key.provider}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          }
        />
      ))}
    </SettingsGroup>
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
  showAgentPreferences,
  defaultModel,
  defaultReasoningLevel,
  preferenceLoading,
  providerDefaultModel,
  reasoningLevels,
  onModelChange,
  onReasoningChange,
}: {
  aiKey: AiKey;
  showAgentPreferences: boolean;
  defaultModel: string | null;
  defaultReasoningLevel: ReasoningLevel;
  preferenceLoading: boolean;
  providerDefaultModel: string | null;
  reasoningLevels: ReasoningLevel[];
  onModelChange: (value: string) => Promise<void>;
  onReasoningChange: (value: ReasoningLevel) => Promise<void>;
}) {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tAdmin = useTranslations("Admin");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const visibleSurfaces = AI_SURFACE_DEFINITIONS.filter(
    (surface) =>
      !isLocalAgentProvider(key.provider) || surface.id === "agent",
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
      await queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
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
      await queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <SettingsGroup
      anchor={showAgentPreferences ? SETTINGS_SECTIONS.accountAgent : undefined}
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
            {surface.id === "agent" && showAgentPreferences ? (
              <div className="mb-3 ml-4 border-l border-border/70 pl-4">
                <AgentPreferenceRows
                  loading={preferenceLoading}
                  loadingLabel={tc("loading")}
                  defaultModel={defaultModel}
                  defaultReasoningLevel={defaultReasoningLevel}
                  providerDefaultModel={providerDefaultModel}
                  reasoningLevels={reasoningLevels}
                  onModelChange={onModelChange}
                  onReasoningChange={onReasoningChange}
                />
              </div>
            ) : null}
            {enabled && surface.modelKeys.length > 0 ? (
              <div className="mb-3 ml-4 border-l border-border/70 pl-4">
                {surface.modelKeys
                  .filter((modelKey) =>
                    key.assigned_capabilities.includes(
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
