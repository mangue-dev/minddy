"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Check, Copy, Plug, Plus } from "lucide-react";
import {
  createIntegrationApi,
  fetchIntegrationsApi,
  revokeIntegrationApi,
} from "@/lib/integrations-api";
import type { Integration } from "@/lib/types";

const integrationsKey = (projectId: string) => ["integrations", projectId] as const;

/** Create dialog: a name form that, once submitted, swaps to the one-time key
    panel — the only moment the plaintext key is ever visible. */
function CreateIntegrationDialog({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Settings");
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
      const { key } = await createIntegrationApi(projectId, trimmed);
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
              <DialogTitle>{t("integrationCreatedTitle")}</DialogTitle>
              <DialogDescription>{t("integrationKeyNotice")}</DialogDescription>
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
                {t("integrationKeyDone")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("newIntegration")}</DialogTitle>
              <DialogDescription>{t("integrationsSectionDesc")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="integration-name" className="text-sm font-medium">
                {t("integrationNameLabel")}
              </label>
              <Input
                id="integration-name"
                required
                autoFocus
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("integrationNamePlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={creating || !name.trim()}>
                {creating && <Spinner />}
                {t("createIntegration")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProjectIntegrations({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: integrationsKey(projectId),
    queryFn: () => fetchIntegrationsApi(projectId),
  });
  const integrations = data?.integrations ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<Integration | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: integrationsKey(projectId) });

  const handleRevoke = async () => {
    if (!toRevoke) return;
    try {
      await revokeIntegrationApi(projectId, toRevoke.id);
      toast.success(t("integrationRevokedToast", { name: toRevoke.name }));
      invalidate();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const lastUsed = (integration: Integration) =>
    integration.last_used_at
      ? t("integrationLastUsed", {
          date: format.dateTime(new Date(integration.last_used_at), {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : t("integrationNeverUsed");

  return (
    <div className="flex flex-col gap-4">
      {isOwner ? (
        <div>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("newIntegration")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("integrationsOwnerOnlyHint")}
        </p>
      )}

      {isLoading ? (
        <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
      ) : integrations.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t("integrationsEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {integrations.map((integration) => (
            <li key={integration.id} className="flex items-center gap-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Plug className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{integration.name}</p>
                  <code className="shrink-0 font-mono text-xs text-muted-foreground">
                    {integration.key_prefix}…
                  </code>
                  {integration.revoked_at && (
                    <Badge variant="secondary">{t("integrationRevokedBadge")}</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {format.dateTime(new Date(integration.created_at), {
                    dateStyle: "medium",
                  })}
                  {" · "}
                  {lastUsed(integration)}
                </p>
              </div>
              {isOwner && !integration.revoked_at && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setToRevoke(integration)}
                >
                  {t("integrationRevoke")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <CreateIntegrationDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />

      <ConfirmDeleteDialog
        open={!!toRevoke}
        onOpenChange={(open) => !open && setToRevoke(null)}
        title={t("integrationRevokeTitle", { name: toRevoke?.name ?? "" })}
        description={t("integrationRevokeDescription")}
        confirmLabel={t("integrationRevoke")}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
