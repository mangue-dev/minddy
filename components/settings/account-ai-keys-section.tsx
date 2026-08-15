"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Switch, toast } from "mangue-ui";
import { Bot, KeyRound, SlidersHorizontal } from "lucide-react";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import {
  saveAgentPreferencesApi,
  updateAiKeyPreferencesApi,
  type AiKey,
} from "@/lib/agent-keys-api";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { AI_SURFACE_DEFINITIONS, type AiSurface, type ByokModelKey } from "@/lib/ai-surfaces";

/**
 * Section « Agent de code » des paramètres du compte (MIN-46) : le provider et
 * la clé d'abord, le modèle par défaut ensuite, le raisonnement en dernier.
 * Chaque provider a un défaut frontier ; OpenRouter BYOK reprend le défaut du
 * quota minddy (même endpoint).
 *
 * Le premier bloc vit dans `ByokConnectPanel` depuis MIN-149 : l'onboarding
 * propose la même chose à l'étape « clé », et deux formulaires de clé auraient
 * divergé au premier provider ajouté.
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const byokKey = keys[0];

  const { defaultModel, defaultReasoningLevel, loading: prefLoading } = useAgentPreferencesQuery();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const reasoningLevels = useReasoningLevelsFor(defaultModel || providerDefaultModel);

  const onModelChange = async (value: string) => {
    try {
      await saveAgentPreferencesApi({ default_model: value || null });
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onReasoningChange = async (value: ReasoningLevel) => {
    try {
      await saveAgentPreferencesApi({ default_reasoning_level: value });
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      {/* ── Provider (quota minddy ou BYOK), EN PREMIER ─────────────────────── */}
      {/* `ByokConnectPanel` est un assistant partagé avec l'onboarding : seul son
          cadre change, jamais son contenu. */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountAiProvider}
        icon={KeyRound}
        title={t("aiProviderTitle")}
        description={t("aiProviderDesc")}
        variant="block"
      >
        <ByokConnectPanel />
      </SettingsGroup>

      {byokKey ? (
        <ByokSurfacePreferences
          aiKey={byokKey}
          defaultModel={defaultModel}
          defaultReasoningLevel={defaultReasoningLevel}
          preferenceLoading={prefLoading}
          providerDefaultModel={providerDefaultModel}
          reasoningLevels={reasoningLevels}
          onModelChange={onModelChange}
          onReasoningChange={onReasoningChange}
        />
      ) : null}

      {/* Sans BYOK, les préférences de l'agent gardent leur carte. Dès qu'une
          clé existe, elles vivent dans la ligne Agent Numo du tableau ci-dessus. */}
      {!keysLoading && !byokKey ? (
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.accountAgent}
          icon={Bot}
          title={t("agentTab")}
          description={t("agentSectionDesc")}
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
    </>
  );
}

/** Surfaces couvertes par la clé et modèle explicite de chaque type d'appel. */
function ByokSurfacePreferences({
  aiKey: key,
  defaultModel,
  defaultReasoningLevel,
  preferenceLoading,
  providerDefaultModel,
  reasoningLevels,
  onModelChange,
  onReasoningChange,
}: {
  aiKey: AiKey;
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

  const saveSurfaces = async (surface: AiSurface, enabled: boolean) => {
    const current = key.enabled_surfaces ?? [];
    const next = enabled
      ? [...current.filter((entry) => entry !== surface), surface]
      : current.filter((entry) => entry !== surface);
    try {
      await updateAiKeyPreferencesApi({ enabled_surfaces: next });
      await queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const saveModel = async (modelKey: ByokModelKey, model: string) => {
    try {
      await updateAiKeyPreferencesApi({
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
      anchor={SETTINGS_SECTIONS.accountAgent}
      icon={SlidersHorizontal}
      title={t("byokSurfacesTitle")}
      description={t("byokSurfacesDesc")}
    >
      {AI_SURFACE_DEFINITIONS.map((surface) => {
        const enabled = key.enabled_surfaces.includes(surface.id);
        return (
          <div key={surface.id} className="border-b border-border/60 last:border-b-0">
            <SettingsRow
              label={t(`byokSurface_${surface.id}`)}
              hint={enabled ? t("byokSurfaceUsesKey") : t("byokSurfaceUsesQuota")}
              control={
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => void saveSurfaces(surface.id, checked)}
                />
              }
            />
            {surface.id === "agent" ? (
              <div className="mb-3 ml-4 border-l border-border/70 pl-4">
                <AgentPreferenceRows
                  loading={preferenceLoading}
                  loadingLabel={tc("loading")}
                  defaultModel={defaultModel}
                  defaultReasoningLevel={defaultReasoningLevel}
                  providerDefaultModel={
                    key.resolved_feature_models?.agent_model ?? providerDefaultModel
                  }
                  reasoningLevels={reasoningLevels}
                  onModelChange={onModelChange}
                  onReasoningChange={onReasoningChange}
                />
              </div>
            ) : null}
            {enabled && surface.modelKeys.length > 0 ? (
              <div className="mb-3 ml-4 border-l border-border/70 pl-4">
                {surface.modelKeys.map((modelKey) => (
                  <SettingsRow
                    key={modelKey}
                    label={tAdmin(`fields.${modelKey}.label` as never)}
                    control={
                      <ModelCombobox
                        value={key.feature_models[modelKey] ?? ""}
                        onChange={(value) => void saveModel(modelKey, value)}
                        defaultLabel={t("byokModelDefault")}
                        defaultModelId={
                          key.resolved_feature_models?.[modelKey] ?? providerDefaultModel
                        }
                        placeholder={tAgent("modelSearchPlaceholder")}
                        emptyLabel={tAgent("modelSearchEmpty")}
                        loadingLabel={tAgent("modelSearchLoading")}
                        freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
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
        hint={t("agentModelDesc")}
        control={
          <ModelCombobox
            value={defaultModel ?? ""}
            onChange={(value) => void onModelChange(value)}
            defaultLabel={t("agentModelRoot")}
            defaultModelId={providerDefaultModel}
            placeholder={tAgent("modelSearchPlaceholder")}
            emptyLabel={tAgent("modelSearchEmpty")}
            loadingLabel={tAgent("modelSearchLoading")}
            freeTextLabel={(query) => tAgent("modelUseCustom", { model: query })}
          />
        }
      />
      <SettingsRow
        label={t("agentReasoningTitle")}
        hint={t("agentReasoningDesc")}
        control={
          <ReasoningCombobox
            value={nearestReasoningLevel(defaultReasoningLevel, reasoningLevels)}
            onChange={(value) => void onReasoningChange(value)}
            levels={reasoningLevels}
          />
        }
      />
    </>
  );
}
