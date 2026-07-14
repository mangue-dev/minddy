"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Spinner, toast } from "mangue-ui";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SettingsSection } from "@/components/settings-shell";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ProviderLogo } from "@/components/model-logo";
import {
  AGENT_PROVIDERS,
  getAgentProvider,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  addAiKeyApi,
  deleteAiKeyApi,
  saveAgentPreferencesApi,
} from "@/lib/agent-keys-api";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { agentModelsQueryKey } from "@/lib/use-agent-models-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";

/**
 * Section « Agent de code » des paramètres du compte (MIN-46) : modèle par défaut
 * perso (cascade : run > CE défaut > défaut racine) + BYOK multi-provider via un
 * petit wizard (choisir le provider → saisir la clé, + base URL pour le
 * générique). UN seul provider actif ; sans BYOK, l'agent utilise la clé
 * plateforme OpenRouter (plafond mensuel).
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { defaultModel, loading: prefLoading } = useAgentPreferencesQuery();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const activeKey = keys[0] ?? null;

  // Wizard : provider choisi (null = étape « choisir »), brouillons clé/base URL.
  const [wizardProvider, setWizardProvider] = useState<AgentProviderId | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const resetWizard = () => {
    setWizardProvider(null);
    setKeyDraft("");
    setBaseUrlDraft("");
  };

  const onModelChange = async (value: string) => {
    try {
      await saveAgentPreferencesApi(value || null);
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const refreshByok = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
    ]);
  };

  const saveKey = async () => {
    const def = wizardProvider ? getAgentProvider(wizardProvider) : null;
    const key = keyDraft.trim();
    if (!def || !key || saving) return;
    if (def.requiresBaseUrl && !/^https?:\/\/.+/i.test(baseUrlDraft.trim())) {
      toast.error(t("aiKeyBaseUrlInvalid"));
      return;
    }
    setSaving(true);
    try {
      await addAiKeyApi({
        provider: def.id,
        key,
        baseUrl: def.requiresBaseUrl ? baseUrlDraft.trim() : undefined,
      });
      await refreshByok();
      toast.success(t("aiKeyAddedToast"));
      resetWizard();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    try {
      await deleteAiKeyApi();
      await refreshByok();
      toast.success(t("aiKeyRemovedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const wizardDef = wizardProvider ? getAgentProvider(wizardProvider) : null;

  return (
    <>
      <SettingsSection title={t("agentModelTitle")} description={t("agentModelDesc")}>
        {prefLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <div className="max-w-md">
            <ModelCombobox
              value={defaultModel ?? ""}
              onChange={(v) => void onModelChange(v)}
              defaultLabel={t("agentModelRoot")}
              placeholder={tAgent("modelSearchPlaceholder")}
              emptyLabel={tAgent("modelSearchEmpty")}
              loadingLabel={tAgent("modelSearchLoading")}
              freeTextLabel={(q) => tAgent("modelUseCustom", { model: q })}
            />
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t("aiKeysTitle")} description={t("aiKeysDesc")}>
        {keysLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : activeKey ? (
          // ── BYOK configuré ─────────────────────────────────────────────────
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <ProviderLogo provider={activeKey.provider} size={20} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {getAgentProvider(activeKey.provider)?.label ?? activeKey.provider}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {activeKey.base_url ? `${activeKey.base_url} · ` : ""}
                {activeKey.key_prefix ?? ""}
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void removeKey()}>
              {t("aiKeyRemove")}
            </Button>
          </div>
        ) : wizardDef ? (
          // ── Wizard étape 2 : clé (+ base URL pour le générique) ─────────────
          <div className="flex max-w-md flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetWizard}
                aria-label={t("aiKeyBack")}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <ProviderLogo provider={wizardDef.id} size={18} />
              <span className="text-sm font-medium">{wizardDef.label}</span>
            </div>

            {wizardDef.requiresBaseUrl ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("aiKeyBaseUrlLabel")}
                </label>
                <Input
                  value={baseUrlDraft}
                  onChange={(e) => setBaseUrlDraft(e.target.value)}
                  placeholder="https://…/v1"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="font-mono text-[13px]"
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("aiKeyLabel")}</label>
              <div className="flex items-center gap-2">
                <Input
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder={wizardDef.keyPlaceholder}
                  type="password"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="font-mono text-[13px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveKey();
                  }}
                />
                <Button
                  type="button"
                  onClick={() => void saveKey()}
                  disabled={saving || !keyDraft.trim()}
                >
                  {saving && <Spinner />}
                  {t("aiKeySave")}
                </Button>
              </div>
              {wizardDef.keysUrl ? (
                <a
                  href={wizardDef.keysUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t("aiKeyGetKey", { provider: wizardDef.label })}
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          // ── Wizard étape 1 : choisir le provider ────────────────────────────
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t("aiKeyEmpty")}</p>
            <div className="flex max-w-md flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t("aiKeyChooseProvider")}
              </span>
              {AGENT_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setWizardProvider(p.id)}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <ProviderLogo provider={p.id} size={18} />
                  <span className="flex-1 text-sm font-medium">{p.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
