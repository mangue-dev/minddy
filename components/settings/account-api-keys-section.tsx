"use client";

import { useEffect, useState } from "react";
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
  toast,
} from "mangue-ui";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { createApiKeyApi, revokeApiKeyApi } from "@/lib/api-keys-api";
import { apiKeysQueryKey, useApiKeysQuery } from "@/lib/use-api-keys-query";
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

/** How-to block: the MCP endpoint URL + the one-liner to plug an agent in. */
function McpConnectHint() {
  const t = useTranslations("Account");
  // window n'existe qu'au client ; rendu après mount pour éviter tout mismatch.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!origin) return null;

  const command = `claude mcp add --transport http minddy ${origin}/api/mcp --header "Authorization: Bearer mdyk_…"`;

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    toast.success(t("keyCopied"));
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{t("mcpConnectHint")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
          {command}
        </code>
        <Button type="button" variant="outline" size="icon" onClick={copyCommand}>
          <Copy />
          <span className="sr-only">{t("copyKey")}</span>
        </Button>
      </div>
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
        <McpConnectHint />

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
                  <KeyRound className="size-4" />
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
