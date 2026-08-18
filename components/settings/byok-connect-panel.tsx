"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
  isLocalAgentProvider,
  MINDDY_QUOTA_PROVIDER_ID,
} from "@/lib/agent-providers";
import { isDesktop } from "@/lib/desktop/bridge";
import { addAiKeyApi, deleteAiKeyApi } from "@/lib/agent-keys-api";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { agentModelsQueryKey } from "@/lib/use-agent-models-query";
import { agentPreferencesQueryKey } from "@/lib/use-agent-preferences-query";

/**
 * “Your API key” — choice of provider and key, and nothing else
 * (MIN-46, extracted by MIN-149).
 *
 * Only one selector FIRST: “Quota minddy” (platform mode, capped)
 * OR a BYOK provider (OpenRouter / OpenAI / Anthropic / Google / generic, at
 * its costs, only one asset at a time). Going back to the minddy quota removes the active key
 * — this is what "minddy quota" means on the server side: absence of
 * BYOK.
 *
 * Same pattern as `McpConnectPanel`: the component serves the account settings
 * (`account-ai-keys-section.tsx`, which adds the model and reasoning
 * by default) and the “key” step of onboarding
 * (`components/home/onboarding-key-step.tsx`, which only adds its output).
 * The journey must remain short: it is the central argument of the price, not un
 * expert setting that we will look for.
 */
export function ByokConnectPanel({
  className,
  onConnected,
}: {
  className?: string;
  /** A key has just been registered — onboarding uses it to move forward. */
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();

  const { keys, loading: keysLoading } = useAiKeysQuery();
  const activeKey = keys[0] ?? null;
  const activeProvider = activeKey?.provider ?? MINDDY_QUOTA_PROVIDER_ID;
  const desktop = isDesktop();

  // Current selection = override in progress (before recording) otherwise the
  // persisted provider. Draft key/base URL for BYOK form.
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = selectedOverride ?? activeProvider;
  const selectedDef = getAgentProvider(selected); // undefined for “quota minddy”
  const localProvider = !!selectedDef && isLocalAgentProvider(selectedDef.id);
  const isConfigured = !!activeKey && activeKey.provider === selected;

  /**
 * The register has BRAND names, which do not translate - except the one
 * in the generic, which is not a brand but a description, and which
 * was displayed in French in the English UI. So it comes from here, not from
 * `AGENT_PROVIDERS`. The rest goes as is.
 */
  const providerLabel = (provider: { id: string; label: string }) => {
    if (provider.id === "generic") return t("aiProviderGeneric");
    if (provider.id === "local_openai") return t("aiProviderLocalOpenAi");
    return provider.label;
  };
  // A local endpoint only makes sense in the app that can reach it. We leave
  // nevertheless the active configuration visible in the browser to be able to
  // remove without having to return to the Mac that created it.
  const providers = AGENT_PROVIDERS.filter(
    (provider) => desktop || !isLocalAgentProvider(provider.id) || provider.id === activeKey?.provider,
  );
  const cloudProviders = providers.filter((provider) => !isLocalAgentProvider(provider.id));
  const localProviders = providers.filter((provider) => isLocalAgentProvider(provider.id));

  /** The key changes the endpoint AND the model catalog: the three readings
 * that depend on it reconcile together, never one without the other. */
  const refreshByok = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
    ]);
  };

  const onProviderChange = async (next: string) => {
    setKeyDraft("");
    // The usual installation does not require any input: the two ports are
    // those offered by Ollama and LM Studio. This value remains editable for
    // Docker, another machine on the LAN or another compatible server.
    setBaseUrlDraft(getAgentProvider(next)?.localDefaultBaseUrl ?? "");
    setSelectedOverride(next);
    // Return to minddy quota = remove active BYOK (platform mode).
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
    if (!selectedDef || (!key && !localProvider) || saving) return;
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
      toast.success(localProvider ? t("aiLocalEndpointAddedToast") : t("aiKeyAddedToast"));
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
          <SelectGroup>
            <SelectLabel>{t("aiProviderCloudGroup")}</SelectLabel>
            <SelectItem value={MINDDY_QUOTA_PROVIDER_ID}>
              <span className="flex items-center gap-2">
                <NumoIcon animated={false} className="size-4 text-primary" />
                {t("aiProviderMinddy")}
              </span>
            </SelectItem>
            {cloudProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  <ProviderLogo provider={p.id} size={16} />
                  {providerLabel(p)}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
          {localProviders.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>{t("aiProviderLocalGroup")}</SelectLabel>
                {localProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <ProviderLogo provider={p.id} size={16} />
                      {providerLabel(p)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>

      {!desktop && !isLocalAgentProvider(activeProvider) ? (
        <p className="text-xs text-muted-foreground">{t("aiProviderLocalDesktopHint")}</p>
      ) : null}

      {selected === MINDDY_QUOTA_PROVIDER_ID ? (
        // ── Minddy quota: platform mode, no key ──────────────────────
        <p className="text-xs text-muted-foreground">{t("aiProviderMinddyHint")}</p>
      ) : isConfigured && activeKey ? (
        // ── BYOK configured: key recall + withdrawal ─────────────────────
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <ProviderLogo provider={activeKey.provider} size={20} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {selectedDef ? providerLabel(selectedDef) : activeKey.provider}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {activeKey.base_url ? `${activeKey.base_url} · ` : ""}
                {activeKey.key_prefix ?? (isLocalAgentProvider(activeKey.provider) ? t("aiKeyNotRequired") : "")}
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void removeKey()}>
              {t("aiKeyRemove")}
            </Button>
          </div>
          {/* MIN-344: A key that the provider has never confirmed does not raise
 any cap. The case is rare (a refused key
 is immediately refused; only those recorded during a failure of the
 supplier remain), but it must be READ — otherwise the account remains capped
 without anything on the screen explaining it. */}
          {activeKey.validated_at ? null : (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t("aiKeyUnconfirmed")}
            </p>
          )}
          {/* MIN-223: said here because it cannot be corrected elsewhere — minddy's key
 is capped by run on the supplier side, this one cannot be capped: it is not on our account. */}
          <p className="text-xs text-muted-foreground">{t("aiKeyVmNote")}</p>
        </div>
      ) : selectedDef ? (
        // ── BYOK to configure: key (+ URL base for the generic) ──────────
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {isLocalAgentProvider(selectedDef.id)
              ? t("aiKeyLocalEndpointHint")
              : t("aiKeysDesc")} {t("aiKeyVmNote")}
          </p>

          {selectedDef.requiresBaseUrl ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {isLocalAgentProvider(selectedDef.id)
                  ? t("aiKeyLocalBaseUrlLabel")
                  : t("aiKeyBaseUrlLabel")}
              </label>
              <Input
                value={baseUrlDraft}
                onChange={(e) => setBaseUrlDraft(e.target.value)}
                placeholder={selectedDef.id === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1"}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="font-mono text-[13px]"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {localProvider ? t("aiKeyOptionalLabel") : t("aiKeyLabel")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={localProvider ? t("aiKeyOptionalPlaceholder") : selectedDef.keyPlaceholder}
                type="password"
                // `off` is ignored by many password managers
                // on password fields; `new-password` actually disables
                // the proposal of registered identifiers for an API key.
                autoComplete="new-password"
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
                disabled={saving || (!localProvider && !keyDraft.trim())}
              >
                {saving && <Spinner />}
                {localProvider ? t("aiLocalEndpointSave") : t("aiKeySave")}
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
