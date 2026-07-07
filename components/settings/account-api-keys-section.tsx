"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Check, Copy, ExternalLink, KeyRound, Plus } from "lucide-react";
import {
  connectAgentKeyApi,
  createApiKeyApi,
  revokeApiKeyApi,
} from "@/lib/api-keys-api";
import { apiKeysQueryKey, useApiKeysQuery } from "@/lib/use-api-keys-query";
import { MCP_AGENTS, getMcpAgent, isMcpAgentId, type McpAgent } from "@/lib/mcp-agents";
import { SettingsSection } from "@/components/settings-shell";
import type { ApiKey } from "@/lib/types";

/** Create dialog: a name form that, once submitted, swaps to the one-time key
    panel — the only moment the plaintext key is ever visible. */
function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Account");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName("");
    setCreatedKey(null);
    setCopied(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const { key } = await createApiKeyApi(trimmed);
      setCreatedKey(key);
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    toast.success(t("keyCopied"));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {createdKey ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("apiKeyCreatedTitle")}</DialogTitle>
              <DialogDescription>{t("apiKeyNotice")}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
                {createdKey}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check /> : <Copy />}
                <span className="sr-only">{t("copyKey")}</span>
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("apiKeyDone")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("newApiKey")}</DialogTitle>
              <DialogDescription>{t("apiKeysSectionDesc")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="api-key-name" className="text-sm font-medium">
                {t("apiKeyNameLabel")}
              </label>
              <Input
                id="api-key-name"
                required
                autoFocus
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("apiKeyNamePlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating && <Spinner />}
                {t("createApiKey")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Logo d'un agent, avec bascule light/dark quand une variante existe. */
function AgentLogo({ agent, className }: { agent: McpAgent; className?: string }) {
  if (!agent.logoDark) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={agent.logo} alt="" aria-hidden className={className} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={agent.logo} alt="" aria-hidden className={cn(className, "dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.logoDark}
        alt=""
        aria-hidden
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}

/** Clé masquée pour l'aperçu — latin-1 uniquement (btoa du deeplink Cursor). */
const MASKED_KEY = "mdyk_····························";

/** « Connecter un agent » : choisir son agent, copier la commande clé en main.
    La clé est générée au premier clic et gardée en mémoire pour la session ;
    si elle existe déjà côté serveur (plaintext irrécupérable), un dialog
    demande confirmation avant de la régénérer (l'ancienne est révoquée). */
function McpConnect() {
  const t = useTranslations("Account");
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(MCP_AGENTS[0]);
  const [busy, setBusy] = useState(false);
  const [regenFor, setRegenFor] = useState<McpAgent | null>(null);
  // Plaintexts obtenus pendant la session — re-copier ne régénère pas.
  const keyCache = useRef(new Map<string, string>());

  // window n'existe qu'au client ; rendu après mount pour éviter tout mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;
  const endpoint = `${origin}/api/mcp`;

  const deliver = async (agent: McpAgent, key: string) => {
    const artifact = agent.build(endpoint, key);
    if (agent.kind === "deeplink") {
      window.location.href = artifact;
      toast.success(t("openingAgent", { name: agent.label }));
      return;
    }
    await navigator.clipboard.writeText(artifact);
    toast.success(agent.kind === "config" ? t("configCopied") : t("commandCopied"));
  };

  const connect = async (agent: McpAgent, regenerate: boolean) => {
    const cached = keyCache.current.get(agent.id);
    if (cached && !regenerate) {
      await deliver(agent, cached);
      return;
    }
    setBusy(true);
    try {
      const result = await connectAgentKeyApi(agent.id, regenerate);
      if (result.exists) {
        setRegenFor(agent);
        return;
      }
      keyCache.current.set(agent.id, result.key);
      void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });
      await deliver(agent, result.key);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const actionLabel =
    selected.kind === "deeplink"
      ? t("installIn", { name: selected.label })
      : selected.kind === "config"
        ? t("copyInstallConfig")
        : t("copyInstallCommand");
  const hint =
    selected.kind === "deeplink"
      ? t("mcpHintCursor")
      : selected.kind === "config"
        ? t("mcpHintWindsurf")
        : t("mcpHintCommand");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{t("mcpConnectDesc")}</p>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("mcpAgentPicker")}>
        {MCP_AGENTS.map((agent) => {
          const active = agent.id === selected.id;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelected(agent)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-brand/40 bg-brand/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <AgentLogo agent={agent} className="size-4" />
              {agent.label}
            </button>
          );
        })}
      </div>

      {selected.kind !== "deeplink" && (
        <code className="max-h-40 overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
          {selected.build(endpoint, MASKED_KEY)}
        </code>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" disabled={busy} onClick={() => void connect(selected, false)}>
          {busy ? <Spinner /> : selected.kind === "deeplink" ? <ExternalLink /> : <Copy />}
          {actionLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      <ConfirmDeleteDialog
        open={!!regenFor}
        onOpenChange={(open) => !open && setRegenFor(null)}
        title={t("mcpRegenTitle", { name: regenFor?.label ?? "" })}
        description={t("mcpRegenDescription")}
        confirmLabel={t("mcpRegenConfirm")}
        onConfirm={() => {
          const agent = regenFor;
          setRegenFor(null);
          if (agent) void connect(agent, true);
        }}
      />
    </div>
  );
}

export function AccountApiKeysSection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { apiKeys, loading } = useApiKeysQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: apiKeysQueryKey });

  const handleRevoke = async () => {
    if (!toRevoke) return;
    try {
      await revokeApiKeyApi(toRevoke.id);
      toast.success(t("apiKeyRevokedToast", { name: toRevoke.name }));
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const lastUsed = (apiKey: ApiKey) =>
    apiKey.last_used_at
      ? t("apiKeyLastUsed", {
          date: format.dateTime(new Date(apiKey.last_used_at), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : t("apiKeyNeverUsed");

  return (
    <SettingsSection
      title={t("apiKeysSectionTitle")}
      description={t("apiKeysSectionDesc")}
    >
      <div className="flex flex-col gap-4">
        <McpConnect />

        <div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("newApiKey")}
          </Button>
        </div>

        {loading ? (
          <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
        ) : apiKeys.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t("apiKeysEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {apiKeys.map((apiKey) => (
              <li key={apiKey.id} className="flex items-center gap-3 py-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  {isMcpAgentId(apiKey.agent) ? (
                    <AgentLogo agent={getMcpAgent(apiKey.agent)} className="size-4" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{apiKey.name}</p>
                    <code className="shrink-0 font-mono text-xs text-muted-foreground">
                      {apiKey.key_prefix}…
                    </code>
                    {apiKey.revoked_at && (
                      <Badge variant="secondary">{t("apiKeyRevokedBadge")}</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {format.dateTime(new Date(apiKey.created_at), {
                      dateStyle: "medium",
                    })}
                    {" · "}
                    {lastUsed(apiKey)}
                  </p>
                </div>
                {!apiKey.revoked_at && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setToRevoke(apiKey)}
                  >
                    {t("apiKeyRevoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <CreateApiKeyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={invalidate}
        />

        <ConfirmDeleteDialog
          open={!!toRevoke}
          onOpenChange={(open) => !open && setToRevoke(null)}
          title={t("apiKeyRevokeTitle", { name: toRevoke?.name ?? "" })}
          description={t("apiKeyRevokeDescription")}
          confirmLabel={t("apiKeyRevoke")}
          onConfirm={handleRevoke}
        />
      </div>
    </SettingsSection>
  );
}
