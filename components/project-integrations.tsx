"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { ListPlus, MessagesSquare, Plug, Plus, Webhook } from "lucide-react";
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

/**
 * Le TYPE d'une clé décide de ce qu'elle a le droit d'écrire — des tickets dans
 * le triage, ou des retours sur le board. C'est l'information la plus lourde de
 * la rangée, et elle se lisait en gris, dans le même badge que « Révoquée ».
 * Une teinte par type, pour qu'elle se prenne d'un coup d'œil.
 *
 * La forme est celle des badges de minddy (teinte à 10 %, bord à 20-30 %, jamais
 * un aplat), comme `PR_STATE_STYLES` — l'icône de la pastille porte déjà la même
 * distinction sans la couleur, donc rien ne repose sur elle seule.
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

/** Reconfigurer le webhook sortant d'une intégration existante : les trois
    mêmes écrans qu'à la création (`components/integrations/webhook-steps.tsx`),
    sans étape à passer — on vient ici pour changer quelque chose. Une URL vidée
    éteint le webhook, et garde les événements et le périmètre pour plus tard. */
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

  // Charger la config de l'intégration à l'ouverture (render-time, pas d'effet).
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
        // Renormalisée ici aussi : valider au clavier soumet sans passer par la
        // sortie de champ. Vide reste vide — c'est ainsi qu'on éteint.
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
      /* Le geste vit en bout de titre ; quand il n'y a rien à lister, il descend
         dans la scène et n'est pas montré deux fois. */
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
                  {/* Les deux états de la clé — ce qu'elle fait, et si elle vit
                      encore — tenus à l'opposé de son nom. */}
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
