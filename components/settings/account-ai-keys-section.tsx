"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from "mangue-ui";
import { SettingsSection } from "@/components/settings-shell";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ProviderLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import {
  AGENT_PROVIDERS,
  getAgentProvider,
  MINDDY_QUOTA_PROVIDER_ID,
} from "@/lib/agent-providers";
import {
  addAiKeyApi,
  deleteAiKeyApi,
  saveAgentPreferencesApi,
} from "@/lib/agent-keys-api";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { agentModelsQueryKey, useAgentModelsQuery } from "@/lib/use-agent-models-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";

/**
 * Section « Agent de code » des paramètres du compte (MIN-46). Un seul sélecteur
 * de provider EN PREMIER — « Quota minddy » (mode plateforme, plafonné) OU un
 * provider BYOK (OpenRouter / OpenAI / Anthropic / Google / générique, à ses
 * frais, un seul actif) — puis le modèle par défaut. Chaque provider a un défaut
 * frontier ; OpenRouter BYOK reprend le défaut du quota minddy (même endpoint).
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tAgent = useTranslations("Agent");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { defaultModel, defaultReasoningLevel, loading: prefLoading } = useAgentPreferencesQuery();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const activeKey = keys[0] ?? null;
  const activeProvider = activeKey?.provider ?? MINDDY_QUOTA_PROVIDER_ID;

  // Sélection courante = override en cours (avant enregistrement) sinon le
  // provider persisté. Brouillons de clé / base URL pour le formulaire BYOK.
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = selectedOverride ?? activeProvider;
  const selectedDef = getAgentProvider(selected); // undefined pour « quota minddy »
  const isConfigured = !!activeKey && activeKey.provider === selected;

  const refreshByok = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
    ]);
  };

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

  const onProviderChange = async (next: string) => {
    setKeyDraft("");
    setBaseUrlDraft("");
    setSelectedOverride(next);
    // Repasser au quota minddy = retirer le BYOK actif (mode plateforme).
    if (next === MINDDY_QUOTA_PROVIDER_ID && activeKey) {
      try {
        await deleteAiKeyApi();
        await refreshByok();
        toast.success(t("aiKeyRemovedToast"));
      } catch (err) {
        toast.error((err as Error).message);
        setSelectedOverride(activeProvider);
      }
    }
  };

  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!selectedDef || !key || saving) return;
    if (selectedDef.requiresBaseUrl && !/^https?:\/\/.+/i.test(baseUrlDraft.trim())) {
      toast.error(t("aiKeyBaseUrlInvalid"));
      return;
    }
    setSaving(true);
    try {
      await addAiKeyApi({
        provider: selectedDef.id,
        key,
        baseUrl: selectedDef.requiresBaseUrl ? baseUrlDraft.trim() : undefined,
      });
      await refreshByok();
      toast.success(t("aiKeyAddedToast"));
      setKeyDraft("");
      setBaseUrlDraft("");
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
      setSelectedOverride(MINDDY_QUOTA_PROVIDER_ID);
      toast.success(t("aiKeyRemovedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      {/* ── Provider (quota minddy ou BYOK), EN PREMIER ─────────────────────── */}
      <SettingsSection title={t("aiProviderTitle")} description={t("aiProviderDesc")}>
        {keysLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <div className="flex max-w-md flex-col gap-3">
            <Select value={selected} onValueChange={(v) => void onProviderChange(v)}>
              <SelectTrigger className="w-full bg-card hover:bg-muted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MINDDY_QUOTA_PROVIDER_ID}>
                  <span className="flex items-center gap-2">
                    <NumoIcon animated={false} className="size-4 text-primary" />
                    {t("aiProviderMinddy")}
                  </span>
                </SelectItem>
                {AGENT_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <ProviderLogo provider={p.id} size={16} />
                      {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected === MINDDY_QUOTA_PROVIDER_ID ? (
              // ── Quota minddy : mode plateforme, aucune clé ──────────────────
              <p className="text-xs text-muted-foreground">{t("aiProviderMinddyHint")}</p>
            ) : isConfigured && activeKey ? (
              // ── BYOK configuré : rappel de la clé + retrait ─────────────────
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <ProviderLogo provider={activeKey.provider} size={20} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {selectedDef?.label ?? activeKey.provider}
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
            ) : selectedDef ? (
              // ── BYOK à configurer : clé (+ base URL pour le générique) ──────
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">{t("aiKeysDesc")}</p>

                {selectedDef.requiresBaseUrl ? (
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
                  <label className="text-xs font-medium text-muted-foreground">
                    {t("aiKeyLabel")}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      placeholder={selectedDef.keyPlaceholder}
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
                  {selectedDef.keysUrl ? (
                    <a
                      href={selectedDef.keysUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {t("aiKeyGetKey", { provider: selectedDef.label })}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
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
              // `high` demande un BYOK : sur le quota minddy, les tokens de
              // réflexion se paient sur le budget mensuel partagé du plan.
              maxLevel={activeKey ? "high" : "medium"}
            />
          </div>
        )}
      </SettingsSection>
    </>
  );
}
