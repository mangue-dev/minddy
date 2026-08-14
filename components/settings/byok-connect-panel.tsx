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
  cn,
  toast,
} from "mangue-ui";
import { ProviderLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import {
  AGENT_PROVIDERS,
  getAgentProvider,
  MINDDY_QUOTA_PROVIDER_ID,
} from "@/lib/agent-providers";
import { addAiKeyApi, deleteAiKeyApi } from "@/lib/agent-keys-api";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { agentModelsQueryKey } from "@/lib/use-agent-models-query";
import { agentPreferencesQueryKey } from "@/lib/use-agent-preferences-query";

/**
 * « Votre clé d'API » — le choix du provider et la clé, et rien d'autre
 * (MIN-46, extrait par MIN-149).
 *
 * Un seul sélecteur EN PREMIER : « Quota minddy » (mode plateforme, plafonné)
 * OU un provider BYOK (OpenRouter / OpenAI / Anthropic / Google / générique, à
 * ses frais, un seul actif à la fois). Repasser au quota minddy retire la clé
 * active — c'est ce que « quota minddy » veut dire côté serveur : absence de
 * BYOK.
 *
 * Même patron que `McpConnectPanel` : le composant sert les réglages du compte
 * (`account-ai-keys-section.tsx`, qui lui ajoute le modèle et le raisonnement
 * par défaut) et l'étape « clé » de l'onboarding
 * (`components/home/onboarding-key-step.tsx`, qui n'y ajoute que sa sortie).
 * Le parcours doit rester court : c'est l'argument central du prix, pas un
 * réglage d'expert qu'on va chercher.
 */
export function ByokConnectPanel({
  className,
  onConnected,
}: {
  className?: string;
  /** Une clé vient d'être enregistrée — l'onboarding s'en sert pour avancer. */
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { keys, loading: keysLoading } = useAiKeysQuery();
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

  /**
   * Le registre porte des noms de MARQUE, qui ne se traduisent pas — sauf celui
   * du générique, qui n'est pas une marque mais une description, et qui
   * s'affichait en français dans l'UI anglaise. Il vient donc d'ici, pas de
   * `AGENT_PROVIDERS`. Le reste passe tel quel.
   */
  const providerLabel = (provider: { id: string; label: string; requiresBaseUrl?: boolean }) =>
    provider.requiresBaseUrl ? t("aiProviderGeneric") : provider.label;

  /** La clé change l'endpoint ET le catalogue de modèles : les trois lectures
   *  qui en dépendent se réconcilient ensemble, jamais l'une sans l'autre. */
  const refreshByok = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
    ]);
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
      onConnected?.();
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

  if (keysLoading) {
    return <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>;
  }

  return (
    <div className={cn("flex max-w-md flex-col gap-3", className)}>
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
                {providerLabel(p)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected === MINDDY_QUOTA_PROVIDER_ID ? (
        // ── Quota minddy : mode plateforme, aucune clé ──────────────────────
        <p className="text-xs text-muted-foreground">{t("aiProviderMinddyHint")}</p>
      ) : isConfigured && activeKey ? (
        // ── BYOK configuré : rappel de la clé + retrait ─────────────────────
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <ProviderLogo provider={activeKey.provider} size={20} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {selectedDef ? providerLabel(selectedDef) : activeKey.provider}
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
          {/* MIN-344 : une clé que le fournisseur n'a jamais confirmée ne lève
              aucun plafond. Le cas est rare (on refuse tout de suite une clé
              refusée ; il ne reste que celles enregistrées pendant une panne du
              fournisseur), mais il doit se LIRE — sinon le compte reste plafonné
              sans que rien à l'écran ne l'explique. */}
          {activeKey.validated_at ? null : (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t("aiKeyUnconfirmed")}
            </p>
          )}
          {/* MIN-223 : dit ici parce que ça ne se corrige pas ailleurs — la clé
              de minddy est plafonnée par run côté fournisseur, celle-ci ne peut
              pas l'être : elle n'est pas sur notre compte. */}
          <p className="text-xs text-muted-foreground">{t("aiKeyVmNote")}</p>
        </div>
      ) : selectedDef ? (
        // ── BYOK à configurer : clé (+ base URL pour le générique) ──────────
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {t("aiKeysDesc")} {t("aiKeyVmNote")}
          </p>

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
                {t("aiKeyGetKey", { provider: providerLabel(selectedDef) })}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
