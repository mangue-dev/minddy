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
import { AGENT_ALLOWED_MODELS } from "@/lib/agent-models";
import {
  addAiKeyApi,
  deleteAiKeyApi,
  saveAgentPreferencesApi,
} from "@/lib/agent-keys-api";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import {
  agentPreferencesQueryKey,
  useAgentPreferencesQuery,
} from "@/lib/use-agent-preferences-query";

/** Valeur du picker représentant « pas de défaut perso » (→ défaut racine). */
const ROOT_VALUE = "__root__";

/**
 * Section « Agent de code » des paramètres du compte (MIN-46) : modèle par défaut
 * perso (cascade : run > CE défaut > défaut racine) + clé BYOK OpenRouter (usage
 * illimité à ses frais, sinon plafond mensuel sur la clé plateforme).
 */
export function AccountAiKeysSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { defaultModel, loading: prefLoading } = useAgentPreferencesQuery();
  const { keys, loading: keysLoading } = useAiKeysQuery();
  const activeKey = keys.find((k) => k.provider === "openrouter") ?? null;

  const [draft, setDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const onModelChange = async (value: string) => {
    const next = value === ROOT_VALUE ? null : value;
    try {
      await saveAgentPreferencesApi(next);
      await queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey });
      toast.success(t("agentModelSavedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const addKey = async () => {
    const key = draft.trim();
    if (!key || savingKey) return;
    setSavingKey(true);
    try {
      await addAiKeyApi(key);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
      toast.success(t("aiKeyAddedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingKey(false);
    }
  };

  const removeKey = async () => {
    try {
      await deleteAiKeyApi();
      await queryClient.invalidateQueries({ queryKey: aiKeysQueryKey });
      toast.success(t("aiKeyRemovedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <SettingsSection title={t("agentModelTitle")} description={t("agentModelDesc")}>
        {prefLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : (
          <Select value={defaultModel ?? ROOT_VALUE} onValueChange={(v) => void onModelChange(v)}>
            <SelectTrigger className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>{t("agentModelRoot")}</SelectItem>
              {AGENT_ALLOWED_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                  {m.hint ? ` · ${m.hint}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </SettingsSection>

      <SettingsSection title={t("aiKeysTitle")} description={t("aiKeysDesc")}>
        {keysLoading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : activeKey ? (
          <div className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {t("aiKeyPresent", { prefix: activeKey.key_prefix ?? "" })}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void removeKey()}>
              {t("aiKeyRemove")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t("aiKeyEmpty")}</p>
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("aiKeyPlaceholder")}
                type="password"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="max-w-md font-mono text-[13px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addKey();
                }}
              />
              <Button type="button" onClick={() => void addKey()} disabled={savingKey || !draft.trim()}>
                {savingKey && <Spinner />}
                {t("aiKeySave")}
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
