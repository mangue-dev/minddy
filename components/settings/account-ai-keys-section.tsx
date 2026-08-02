"use client";

import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { SettingsSection } from "@/components/settings-shell";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ByokConnectPanel } from "@/components/settings/byok-connect-panel";
import { saveAgentPreferencesApi } from "@/lib/agent-keys-api";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";

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

  const { defaultModel, defaultReasoningLevel, loading: prefLoading } = useAgentPreferencesQuery();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();

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
      <SettingsSection title={t("aiProviderTitle")} description={t("aiProviderDesc")}>
        <ByokConnectPanel />
      </SettingsSection>

      {/* ── Modèle par défaut, ENSUITE ──────────────────────────────────────── */}
      <SettingsSection title={t("agentModelTitle")} description={t("agentModelDesc")}>
        {prefLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <div className="max-w-md">
            <ModelCombobox
              value={defaultModel ?? ""}
              onChange={(v) => void onModelChange(v)}
              defaultLabel={t("agentModelRoot")}
              defaultModelId={providerDefaultModel}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
            />
          </div>
        )}
      </SettingsSection>

      {/* ── Niveau de raisonnement par défaut (MIN-122) ─────────────────────── */}
      <SettingsSection title={t("agentReasoningTitle")} description={t("agentReasoningDesc")}>
        {prefLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <div className="max-w-md">
            <ReasoningCombobox
              value={defaultReasoningLevel}
              onChange={(v) => void onReasoningChange(v)}
            />
          </div>
        )}
      </SettingsSection>
    </>
  );
}
