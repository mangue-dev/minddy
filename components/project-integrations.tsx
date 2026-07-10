"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Check, Copy, ListPlus, MessagesSquare, Plug, Plus, Webhook } from "lucide-react";
import {
  createIntegrationApi,
  revokeIntegrationApi,
  updateIntegrationWebhookApi,
} from "@/lib/integrations-api";
import {
  integrationsQueryKey,
  useIntegrationsQuery,
} from "@/lib/use-integrations-query";
import type {
  Integration,
  IntegrationKind,
  IntegrationWebhookEvent,
  IntegrationWebhookScope,
} from "@/lib/types";

/** Choix du type de clé à la création : deux cartes exclusives. */
function KindPicker({
  value,
  onChange,
}: {
  value: IntegrationKind;
  onChange: (kind: IntegrationKind) => void;
}) {
  const t = useTranslations("Settings");
  const options = [
    {
      kind: "issues" as const,
      icon: ListPlus,
      label: t("integrationKind_issues"),
      description: t("integrationKindIssuesDesc"),
    },
    {
      kind: "feedback" as const,
      icon: MessagesSquare,
      label: t("integrationKind_feedback"),
      description: t("integrationKindFeedbackDesc"),
    },
  ];
  return (
    <div className="flex flex-col gap-2" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.kind}
          type="button"
          role="radio"
          aria-checked={value === option.kind}
          onClick={() => onChange(option.kind)}
          className={cn(
            "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
            value === option.kind
              ? "border-primary/60 bg-primary/5"
              : "hover:border-foreground/25"
          )}
        >
          <option.icon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              value === option.kind ? "text-primary" : "text-muted-foreground"
            )}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Create dialog: kind + name form that, once submitted, swaps to the one-time
    key panel — the only moment the plaintext key is ever visible. */
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
  const [kind, setKind] = useState<IntegrationKind>("issues");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName("");
    setKind("issues");
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
      const { key } = await createIntegrationApi(projectId, trimmed, kind);
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
              <p className="text-sm font-medium">{t("integrationKindLabel")}</p>
              <KindPicker value={kind} onChange={setKind} />
            </div>
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

const WEBHOOK_EVENTS: IntegrationWebhookEvent[] = [
  "issue.created",
  "issue.status_changed",
  "issue.updated",
];

/** Per-integration outgoing-webhook config: URL, followed events, scope.
    An empty URL disables the webhook (events/scope are kept for later). */
function WebhookDialog({
  projectId,
  integration,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  integration: Integration | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Settings");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<IntegrationWebhookEvent[]>([]);
  const [scope, setScope] = useState<IntegrationWebhookScope>("integration");
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Charger la config de l'intégration à l'ouverture (render-time, pas d'effet).
  if (integration && loadedFor !== integration.id) {
    setLoadedFor(integration.id);
    setUrl(integration.webhook_url ?? "");
    setEvents(
      integration.webhook_events?.length
        ? integration.webhook_events
        : ["issue.status_changed"]
    );
    setScope(integration.webhook_scope ?? "integration");
  }

  const toggleEvent = (event: IntegrationWebhookEvent, checked: boolean) =>
    setEvents((prev) =>
      checked ? [...new Set([...prev, event])] : prev.filter((e) => e !== event)
    );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integration) return;
    setSaving(true);
    try {
      await updateIntegrationWebhookApi(projectId, integration.id, {
        webhook_url: url.trim() || null,
        webhook_events: events,
        webhook_scope: scope,
      });
      toast.success(t("webhookSaved"));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!integration}
      onOpenChange={(next) => {
        if (!next) setLoadedFor(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="size-4 text-brand" />
              {t("webhookTitle", { name: integration?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("webhookDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="webhook-url" className="text-sm font-medium">
              {t("webhookUrlLabel")}
            </label>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/minddy-webhook"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{t("webhookUrlHint")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("webhookEventsLabel")}</p>
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={events.includes(event)}
                  onCheckedChange={(checked) => toggleEvent(event, checked === true)}
                />
                <span>{t(`webhookEvent_${event.replace(".", "_")}` as Parameters<typeof t>[0])}</span>
                <code className="ml-auto font-mono text-xs text-muted-foreground">
                  {event}
                </code>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">{t("webhookScopeLabel")}</label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as IntegrationWebhookScope)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="integration">{t("webhookScopeIntegration")}</SelectItem>
                <SelectItem value="all">{t("webhookScopeAll")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{t("webhookSignatureHint")}</p>

          <DialogFooter>
            <Button type="submit" disabled={saving || (!!url.trim() && events.length === 0)}>
              {saving && <Spinner />}
              {t("webhookSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pastille d'état de la dernière livraison webhook (vert 2xx, rouge sinon). */
function WebhookStatusDot({ integration }: { integration: Integration }) {
  const t = useTranslations("Settings");
  const format = useFormatter();
  if (!integration.webhook_url) return null;
  const status = integration.webhook_last_status;
  const healthy = !!status && /^2/.test(status);
  const label = status
    ? t("webhookLastDelivery", {
        status,
        date: integration.webhook_last_at
          ? format.dateTime(new Date(integration.webhook_last_at), {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—",
      })
    : t("webhookNoDelivery");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Webhook className="size-3.5" />
          <span
            className={cn(
              "size-1.5 rounded-full",
              !status ? "bg-muted-foreground/40" : healthy ? "bg-green-500" : "bg-destructive"
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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

  const { integrations, loading } = useIntegrationsQuery(projectId);

  const [createOpen, setCreateOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<Integration | null>(null);
  const [webhookFor, setWebhookFor] = useState<Integration | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: integrationsQueryKey(projectId) });

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

      {loading ? (
        <p className="py-2 text-sm text-muted-foreground">{tc("loading")}</p>
      ) : integrations.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t("integrationsEmpty")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {integrations.map((integration) => (
            <li key={integration.id} className="flex items-center gap-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                {integration.kind === "feedback" ? (
                  <MessagesSquare className="size-4" />
                ) : (
                  <Plug className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{integration.name}</p>
                  <code className="shrink-0 font-mono text-xs text-muted-foreground">
                    {integration.key_prefix}…
                  </code>
                  <Badge variant="secondary">
                    {t(`integrationKind_${integration.kind}`)}
                  </Badge>
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
              <WebhookStatusDot integration={integration} />
              {isOwner && !integration.revoked_at && (
                <>
                  {/* Les webhooks suivent des événements d'issues : réservés aux clés issues. */}
                  {integration.kind === "issues" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWebhookFor(integration)}
                    >
                      <Webhook />
                      {t("webhookButton")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setToRevoke(integration)}
                  >
                    {t("integrationRevoke")}
                  </Button>
                </>
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

      <WebhookDialog
        projectId={projectId}
        integration={webhookFor}
        onOpenChange={(open) => !open && setWebhookFor(null)}
        onSaved={invalidate}
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
