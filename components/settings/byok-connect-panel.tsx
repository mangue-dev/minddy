"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  AGENT_PROVIDERS,
  getAgentProvider,
  isLocalAgentProvider,
} from "@/lib/agent-providers";
import { addAiKeyApi, deleteAiKeyApi, type AiKey } from "@/lib/agent-keys-api";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { aiKeysQueryKey, useAiKeysQuery } from "@/lib/use-ai-keys-query";
import { agentModelsQueryKey } from "@/lib/use-agent-models-query";
import { agentPreferencesQueryKey } from "@/lib/use-agent-preferences-query";

const MINDDY_CLOUD_PROVIDER = "minddy";

/** Multi-provider BYOK credential list shared by account settings and onboarding. */
export function ByokConnectPanel({
  className,
  onConnected,
}: {
  className?: string;
  onConnected?: () => void;
}) {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const queryClient = useQueryClient();
  const { capabilities } = useRuntimeConfig();
  const managedAiAvailable = capabilities.managedAi?.configured === true;
  const { keys, loading } = useAiKeysQuery();
  const [editing, setEditing] = useState<AiKey | null>(null);
  const [provider, setProvider] = useState(() =>
    managedAiAvailable
      ? MINDDY_CLOUD_PROVIDER
      : (AGENT_PROVIDERS.find((entry) => !isLocalAgentProvider(entry.id))?.id ?? ""),
  );
  const [keyDraft, setKeyDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const providerLabel = (entry: { id: string; label: string }) => {
    if (entry.id === "generic") return t("aiProviderGeneric");
    if (entry.id === "local_openai") return t("aiProviderLocalOpenAi");
    return entry.label;
  };
  const availableProviders = useMemo(
    () =>
      AGENT_PROVIDERS.filter(
        (entry) =>
          (!isLocalAgentProvider(entry.id) || entry.id === editing?.provider) &&
          (entry.id === editing?.provider ||
            !keys.some((key) => key.provider === entry.id)),
      ),
    [editing?.provider, keys],
  );

  useEffect(() => {
    if (
      editing ||
      (managedAiAvailable && provider === MINDDY_CLOUD_PROVIDER) ||
      (provider && availableProviders.some((entry) => entry.id === provider))
    )
      return;
    setProvider(
      managedAiAvailable
        ? MINDDY_CLOUD_PROVIDER
        : (availableProviders[0]?.id ?? ""),
    );
  }, [availableProviders, editing, managedAiAvailable, provider]);

  const selectedDef = getAgentProvider(provider);
  const localProvider = !!selectedDef && isLocalAgentProvider(selectedDef.id);
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeysQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentModelsQueryKey }),
      queryClient.invalidateQueries({ queryKey: agentPreferencesQueryKey }),
    ]);
  const resetForm = () => {
    setEditing(null);
    setKeyDraft("");
    setBaseUrlDraft("");
    setProvider(
      managedAiAvailable
        ? MINDDY_CLOUD_PROVIDER
        : (availableProviders[0]?.id ?? ""),
    );
  };
  const beginEdit = (key: AiKey) => {
    setEditing(key);
    setProvider(key.provider);
    setKeyDraft("");
    setBaseUrlDraft(key.base_url ?? "");
  };
  const selectProvider = (next: string) => {
    setProvider(next);
    setKeyDraft("");
    setBaseUrlDraft(getAgentProvider(next)?.localDefaultBaseUrl ?? "");
  };
  const saveKey = async () => {
    const key = keyDraft.trim();
    if (!selectedDef || (!key && !localProvider) || saving) return;
    if (
      selectedDef.requiresBaseUrl &&
      !/^https?:\/\/.+/i.test(baseUrlDraft.trim())
    ) {
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
      await refresh();
      toast.success(
        localProvider ? t("aiLocalEndpointAddedToast") : t("aiKeyAddedToast"),
      );
      resetForm();
      onConnected?.();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const removeKey = async (key: AiKey) => {
    try {
      await deleteAiKeyApi(key.id);
      await refresh();
      if (editing?.id === key.id) resetForm();
      toast.success(t("aiKeyRemovedToast"));
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (loading)
    return (
      <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
    );
  const cloudProviders = availableProviders.filter(
    (entry) => !isLocalAgentProvider(entry.id),
  );
  const localProviders = availableProviders.filter((entry) =>
    isLocalAgentProvider(entry.id),
  );

  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", className)}>
      {keys.map((key) => {
        const definition = getAgentProvider(key.provider);
        return (
          <div
            key={key.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <ProviderLogo provider={key.provider} size={20} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {definition ? providerLabel(definition) : key.provider}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {key.base_url ? `${key.base_url} · ` : ""}
                {key.key_prefix ??
                  (isLocalAgentProvider(key.provider)
                    ? t("aiKeyNotRequired")
                    : "")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => beginEdit(key)}
            >
              {tc("edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void removeKey(key)}
            >
              {t("aiKeyRemove")}
            </Button>
          </div>
        );
      })}

      <div className="flex flex-col gap-3 rounded-lg border border-border/70 p-3">
          <Select
            value={provider}
            onValueChange={selectProvider}
            disabled={!!editing}
          >
            <SelectTrigger className="w-full bg-card hover:bg-muted">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t("aiProviderCloudGroup")}</SelectLabel>
                {managedAiAvailable && !editing ? (
                  <SelectItem value={MINDDY_CLOUD_PROVIDER}>
                    {t("aiProviderMinddy")}
                  </SelectItem>
                ) : null}
                {cloudProviders.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    <span className="flex items-center gap-2">
                      <ProviderLogo provider={entry.id} size={16} />
                      {providerLabel(entry)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
              {localProviders.length > 0 ? (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t("aiProviderLocalGroup")}</SelectLabel>
                    {localProviders.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        <span className="flex items-center gap-2">
                          <ProviderLogo provider={entry.id} size={16} />
                          {providerLabel(entry)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              ) : null}
            </SelectContent>
          </Select>
          {provider === MINDDY_CLOUD_PROVIDER ? (
            <p className="text-xs text-muted-foreground">
              {t("aiProviderMinddyHint")}
            </p>
          ) : null}
          {selectedDef?.requiresBaseUrl ? (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {localProvider
                ? t("aiKeyLocalBaseUrlLabel")
                : t("aiKeyBaseUrlLabel")}
              <Input
                value={baseUrlDraft}
                onChange={(event) => setBaseUrlDraft(event.target.value)}
                placeholder={selectedDef.localDefaultBaseUrl}
                spellCheck={false}
                className="font-mono text-[13px]"
              />
            </label>
          ) : null}
          {selectedDef ? (
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {localProvider ? t("aiKeyOptionalLabel") : t("aiKeyLabel")}
              <Input
                value={keyDraft}
                onChange={(event) => setKeyDraft(event.target.value)}
                placeholder={
                  localProvider
                    ? t("aiKeyOptionalPlaceholder")
                    : selectedDef.keyPlaceholder
                }
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                className="font-mono text-[13px]"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveKey();
                }}
              />
            </label>
          ) : null}
          {!editing && selectedDef?.keysUrl ? (
            <a
              href={selectedDef.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t("aiKeyGetKey", { provider: providerLabel(selectedDef) })}
            </a>
          ) : null}
          <div className="flex justify-end gap-2">
            {editing ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                {tc("cancel")}
              </Button>
            ) : null}
            {selectedDef ? (
              <Button
                type="button"
                onClick={() => void saveKey()}
                disabled={saving || (!localProvider && !keyDraft.trim())}
              >
                {saving ? <Spinner /> : null}
                {editing ? tc("save") : t("aiKeySave")}
              </Button>
            ) : null}
          </div>
        </div>
      {keys.some((key) => !key.validated_at) ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {t("aiKeyUnconfirmed")}
        </p>
      ) : null}
      {keys.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t("aiKeyVmNote")}</p>
      ) : null}
    </div>
  );
}
