"use client";

import { ObjectiveValue } from "@/components/issue-property-fields";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { updateIntegrationObjectiveApi } from "@/lib/integrations-api";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, Target02Icon, MessageMultiple01Icon, MoreHorizontalIcon, Plug01Icon, WebhookIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  revokeIntegrationApi,
  updateIntegrationWebhookApi,
} from "@/lib/integrations-api";
import {
  integrationsQueryKey,
  useIntegrationsQuery,
} from "@/lib/use-integrations-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SettingsEmpty,
  SettingsGroup,
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
import { ObjectiveBadge } from "@/components/objective-label";
import type { Integration, IntegrationKind } from "@/lib/types";

/**
 * The TYPE of a key decides what it is allowed to write — tickets in
 * triage, or feedback on the board. This is the heaviest information in the row, and it read gray, in the same badge as "Revoked." 20-30%, never
 * a solid color), like `PR_STATE_STYLES` — the dot icon already bears the same
 * distinction without the color, so nothing relies on it alone.
 */
const KIND_STYLES: Record<IntegrationKind, { badge: string; avatar: string }> =
  {
    issues: {
      badge: "bg-brand/10 text-brand",
      avatar: "bg-brand/10 text-brand",
    },
    feedback: {
      badge:
        "bg-amber-600/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
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

/** The last webhook delivery, said in words next to a colored dot (green
    accepted, red refused, gray nothing sent yet) — the dot alone used to be
    the only signal, behind a tooltip. */
function WebhookStatus({ integration }: { integration: Integration }) {
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
    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          !status
            ? "bg-muted-foreground/40"
            : healthy
              ? "bg-green-500"
              : "bg-destructive",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** A labelled detail under an integration, aligned with its name. */
function IntegrationDetail({
  icon,
  label,
  children,
}: {
  icon: typeof WebhookIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-11">
      <span className="flex items-center gap-2 text-sm">
        <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" aria-hidden />
        {label}
      </span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
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

  const { objectives } = useObjectivesQuery(projectId);
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

  // Working keys first; revoked ones stay listed below, dimmed, as a record.
  const sorted = [...integrations].sort(
    (a, b) => Number(!!a.revoked_at) - Number(!!b.revoked_at),
  );

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
      title={t("integrationsTab")}
      help={t("integrationsSectionDesc")}
      /* The gesture lives at the end of the title; when there is nothing to list, it moves down
 in the scene and is not shown twice. */
      action={
        isOwner && integrations.length > 0 ? (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} />
            {t("newIntegration")}
          </Button>
        ) : undefined
      }
    >
      {!isOwner && (
        <p className="py-3 text-xs text-muted-foreground">
          {t("integrationsOwnerOnlyHint")}
        </p>
      )}

      {loading ? (
        <SettingsEmpty>{tc("loading")}</SettingsEmpty>
      ) : integrations.length === 0 ? (
        <EmptyScene size="compact" icon={Plug01Icon} title={t("integrationsEmpty")}>
          {isOwner && (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} />
              {t("newIntegration")}
            </Button>
          )}
        </EmptyScene>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {sorted.map((integration) => {
            const revoked = !!integration.revoked_at;
            const objective = objectives.find((o) => o.id === integration.objective_id);
            const badges = (
              <>
                <Badge
                  variant="secondary"
                  className={cn("h-6", KIND_STYLES[integration.kind].badge)}
                >
                  {t(`integrationKind_${integration.kind}`)}
                </Badge>
                {revoked && (
                  <Badge variant="destructive" className="h-6">
                    {t("integrationRevokedBadge")}
                  </Badge>
                )}
              </>
            );
            return (
              <li
                key={integration.id}
                className={cn("flex flex-col gap-1 py-3.5", revoked && "opacity-60")}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      KIND_STYLES[integration.kind].avatar,
                    )}
                  >
                    <HugeiconsIcon
                      icon={integration.kind === "feedback" ? MessageMultiple01Icon : Plug01Icon}
                      className="size-4"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{integration.name}</span>
                      <code className="shrink-0 font-mono text-xs text-muted-foreground">
                        {integration.key_prefix}…
                      </code>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        format.dateTime(new Date(integration.created_at), { dateStyle: "medium" }),
                        lastUsed(integration),
                      ].join(" · ")}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 sm:hidden">{badges}</div>
                  </div>
                  {/* What the key does, and whether it still works: on the
                      right from `sm` up, under the name on a phone so the
                      name keeps the width. */}
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">{badges}</div>
                  {isOwner && !revoked && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("integrationActions", { name: integration.name })}
                        >
                          <HugeiconsIcon icon={MoreHorizontalIcon} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Webhooks follow issue events: reserved for issue keys. */}
                        {integration.kind === "issues" && (
                          <>
                            <DropdownMenuItem onSelect={() => setWebhookFor(integration)}>
                              <HugeiconsIcon icon={WebhookIcon} />
                              {t("webhookConfigure")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setToRevoke(integration)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                          {t("integrationRevoke")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Feedback keys file what they receive under an objective;
                    the picker can create one in place. */}
                {integration.kind === "feedback" && !revoked && (
                  <IntegrationDetail icon={Target02Icon} label={t("integrationObjectiveLabel")}>
                    {isOwner ? (
                      <ObjectiveValue
                        value={integration.objective_id}
                        objectives={objectives}
                        projectId={projectId}
                        onChange={async (value) => {
                          try {
                            await updateIntegrationObjectiveApi(projectId, integration.id, value);
                            invalidate();
                          } catch (error) {
                            toast.error((error as Error).message);
                          }
                        }}
                      />
                    ) : (
                      objective ? (
                        <ObjectiveBadge objective={objective} />
                      ) : (
                        <span className="text-sm text-muted-foreground">{tc("none")}</span>
                      )
                    )}
                  </IntegrationDetail>
                )}
                {integration.kind === "issues" && !revoked && integration.webhook_url && (
                  <IntegrationDetail icon={WebhookIcon} label={t("webhookButton")}>
                    <WebhookStatus integration={integration} />
                  </IntegrationDetail>
                )}
              </li>
            );
          })}
        </ul>
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
