"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  cn,
  toast,
} from "mangue-ui";
import { MessagesSquare, Plug, Plus, Webhook } from "lucide-react";
import {
  revokeIntegrationApi,
  updateIntegrationWebhookApi,
} from "@/lib/integrations-api";
import {
  integrationsQueryKey,
  useIntegrationsQuery,
} from "@/lib/use-integrations-query";
import {
  SettingsEmpty,
  SettingsGroup,
  SettingsListRow,
} from "@/components/settings/settings-ui";
import { WizardDialog } from "@/components/wizard/wizard-dialog";
import { CreateIntegrationWizard } from "@/components/integrations/create-integration-wizard";
import {
  DEFAULT_WEBHOOK,
  useWebhookSteps,
  type WebhookConfig,
} from "@/components/integrations/webhook-steps";
import { normalizeWebhookUrl } from "@/lib/webhook-url";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { EmptyScene } from "@/components/empty-scene";
import type { Integration, IntegrationKind } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The TYPE of a key decides what it is allowed to write — tickets in
 * triage, or feedback on the board. This is the heaviest information in the row, and it read gray, in the same badge as "Revoked." 20-30%, never
 * a solid color), like `PR_STATE_STYLES` — the dot icon already bears the same
 * distinction without the color, so nothing relies on it alone.
 */
const KIND_STYLES: Record<IntegrationKind, { badge: string; avatar: string }> =
  {
    issues: {
      badge: "border-brand/30 bg-brand/10 text-brand",
      avatar: "bg-brand/10 text-brand",
    },
    feedback: {
      badge:
        "border-amber-600/25 bg-amber-600/10 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400",
      avatar: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
  };

/** Reconfigure the webhook coming out of an existing integration: the three
 same screens as when created (`components/integrations/webhook-steps.tsx`),
 with no steps to go through — we come here to change something. A flushed URL
 turns off the webhook, and saves events and scope for later. */
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
  const [webhook, setWebhook] = useState<WebhookConfig>(DEFAULT_WEBHOOK);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Load the integration config when opened (render-time, no effect).
  if (integration && loadedFor !== integration.id) {
    setLoadedFor(integration.id);
    setWebhook({
      url: integration.webhook_url ?? "",
      events: integration.webhook_events?.length
        ? integration.webhook_events
        : DEFAULT_WEBHOOK.events,
      scope: integration.webhook_scope ?? DEFAULT_WEBHOOK.scope,
    });
    setStepIndex(0);
  }

  const save = async () => {
    if (!integration) return;
    setSaving(true);
    try {
      await updateIntegrationWebhookApi(projectId, integration.id, {
        // Renormalized here too: validate on the keyboard submit without going through the
        // field output. Empty stays empty — that's how you turn off.
        webhook_url: normalizeWebhookUrl(webhook.url) || null,
        webhook_events: webhook.events,
        webhook_scope: webhook.scope,
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

  const webhookSteps = useWebhookSteps({
    value: webhook,
    onChange: setWebhook,
    scopeSubmitLabel: t("webhookSave"),
  });

  return (
    <WizardDialog
      open={!!integration}
      onOpenChange={(next) => {
        if (!next) setLoadedFor(null);
        onOpenChange(next);
      }}
      label={t("webhookTitle", { name: integration?.name ?? "" })}
      steps={[
        webhookSteps.webhookUrl,
        webhookSteps.webhookEvents,
        webhookSteps.webhookScope,
      ]}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={saving}
      onSubmit={(id) => {
        if (id === "webhookScope") void save();
        else setStepIndex((i) => i + 1);
      }}
    />
  );
}

/** Status badge of the last webhook delivery (green 2xx, red otherwise). */
function WebhookStatusDot({ integration }: { integration: Integration }) {
  const t = useTranslations("Settings");
  const format = useFormatter();
  if (!integration.webhook_url) return null;
  // “accepted” or “refused”, never the recipient’s HTTP code: the
  // server no longer renders it (MIN-341), it does not do a port scanner.
  const status = integration.webhook_last_status;
  const healthy = status === "ok";
  const label = status
    ? t("webhookLastDelivery", {
        status: t(healthy ? "webhookDeliveryOk" : "webhookDeliveryFailed"),
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
              !status
                ? "bg-muted-foreground/40"
                : healthy
                  ? "bg-green-500"
                  : "bg-destructive",
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
    void queryClient.invalidateQueries({
      queryKey: integrationsQueryKey(projectId),
    });

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
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectIntegrations}
      icon={Plug}
      title={t("integrationsTab")}
      description={t("integrationsSectionDesc")}
      variant="block"
      /* The gesture lives at the end of the title; when there is nothing to list, it moves down
 in the scene and is not shown twice. */
      action={
        isOwner && integrations.length > 0 ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("newIntegration")}
          </Button>
        ) : undefined
      }
    >
      {!isOwner && (
        <p className="mb-4 text-xs text-muted-foreground">
          {t("integrationsOwnerOnlyHint")}
        </p>
      )}

      {loading ? (
        <SettingsEmpty>{tc("loading")}</SettingsEmpty>
      ) : integrations.length === 0 ? (
        <EmptyScene size="compact" icon={Plug} title={t("integrationsEmpty")}>
          {isOwner && (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              {t("newIntegration")}
            </Button>
          )}
        </EmptyScene>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {integrations.map((integration) => (
            <SettingsListRow
              key={integration.id}
              avatar={
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    KIND_STYLES[integration.kind].avatar,
                  )}
                >
                  {integration.kind === "feedback" ? (
                    <MessagesSquare className="size-4" />
                  ) : (
                    <Plug className="size-4" />
                  )}
                </span>
              }
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{integration.name}</span>
                  <code className="shrink-0 font-mono text-xs font-normal text-muted-foreground">
                    {integration.key_prefix}…
                  </code>
                </span>
              }
              subtitle={
                format.dateTime(new Date(integration.created_at), {
                  dateStyle: "medium",
                }) +
                " · " +
                lastUsed(integration)
              }
              action={
                <>
                  {/* The two states of the key — what it does, and whether it lives
 yet — held opposite its name. */}
                  <Badge
                    variant="secondary"
                    className={cn("h-6", KIND_STYLES[integration.kind].badge)}
                  >
                    {t(`integrationKind_${integration.kind}`)}
                  </Badge>
                  {integration.revoked_at && (
                    <Badge variant="destructive" className="h-6">
                      {t("integrationRevokedBadge")}
                    </Badge>
                  )}
                  <WebhookStatusDot integration={integration} />
                  {isOwner && !integration.revoked_at && (
                    <>
                      {/* Webhooks follow issue events: reserved for issue keys. */}
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
                </>
              }
            />
          ))}
        </div>
      )}

      <CreateIntegrationWizard
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
        cancelLabel={tc("cancel")}
        onConfirm={handleRevoke}
      />
    </SettingsGroup>
  );
}
