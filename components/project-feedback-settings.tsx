"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Skeleton,
  Spinner,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import {
  CustomDomainSection,
  fetchCustomDomainApi,
} from "@/components/custom-domain-section";
import { FeedbackIntegrationWizard } from "@/components/feedback-integration-wizard";

/**
 * Onglet Feedback des settings (MIN-37) — la configuration des TROIS canaux de
 * collecte, cumulables : board public (avec l'identité des visiteurs, SSO
 * fortement recommandé), API serveur-à-serveur (clés d'intégration de type
 * « feedback »), saisie interne (toujours active, rien à configurer).
 */

interface BoardSettings {
  enabled: boolean;
  show_views: boolean;
  visible_view_ids: string[];
  token: string;
  sso_secret: string | null;
  sso_configured: boolean;
}

interface SharedView {
  id: string;
  name: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

/** Carte d'un canal : titre, action à droite, contenu optionnel. */
function ChannelCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ProjectFeedbackSettings({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const settingsPath = `/api/projects/${projectId}/feedback/settings`;

  const { data, isLoading } = useQuery({
    queryKey: ["feedback-settings", projectId],
    queryFn: () =>
      api<{ board: BoardSettings | null; shared_views: SharedView[] }>(settingsPath),
  });
  const board = data?.board ?? null;
  const sharedViews = data?.shared_views ?? [];

  // Domaine personnalisé (MIN-36) — même query que la CustomDomainSection
  // (dédupliquée par React Query) pour préférer le domaine vérifié dans l'URL.
  const domainPath = `/api/projects/${projectId}/feedback/domain`;
  const { data: domainData } = useQuery({
    queryKey: ["feedback-domain", projectId],
    queryFn: () => fetchCustomDomainApi(domainPath),
    enabled: Boolean(board?.enabled),
  });
  const verifiedDomain =
    domainData?.domain?.status === "verified" ? domainData.domain.domain : null;

  const { integrations } = useIntegrationsQuery(projectId);
  const feedbackKeyCount = integrations.filter(
    (i) => i.kind === "feedback" && !i.revoked_at
  ).length;

  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["feedback-settings", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = (enabled: boolean) =>
    mutate(() =>
      api(settingsPath, { method: "PATCH", body: JSON.stringify({ enabled }) })
    );
  const post = (action: string) =>
    mutate(() => api(settingsPath, { method: "POST", body: JSON.stringify({ action }) }));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Le domaine personnalisé vérifié devient l'URL de référence du board.
  const publicUrl = verifiedDomain
    ? `https://${verifiedDomain}`
    : board
      ? `${origin}/f/${board.token}`
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Intégrer dans mon app : prompt tout-en-un (owner : secrets) ── */}
      {isOwner && <FeedbackIntegrationWizard projectId={projectId} />}

      {/* ── Canal 1 : board public ─────────────────────────────────────── */}
      <ChannelCard
        title={t("feedbackChannelBoardTitle")}
        description={t("feedbackChannelBoardDesc")}
        action={
          <Switch
            checked={board?.enabled ?? false}
            disabled={busy || !isOwner}
            onCheckedChange={(v) => void setEnabled(v)}
          />
        }
      >
        {board?.enabled && publicUrl && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">{t("feedbackUrl")}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} className="font-mono text-xs" />
              <CopyButton value={publicUrl} />
              <Button variant="ghost" size="icon-sm" asChild>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("feedbackUrl")}
                >
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void post("rotate_token")}
                className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className="size-3" />
                {t("feedbackRotateToken")}
              </button>
            )}
          </div>
        )}

        {/* ── Domaine personnalisé (MIN-36) ──────────────────────────────── */}
        {board?.enabled && (
          <CustomDomainSection
            endpoint={domainPath}
            queryKey={["feedback-domain", projectId]}
            className="border-t pt-3"
          />
        )}

        {board?.enabled && (
          <div className="flex flex-col gap-3 border-t pt-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm">{t("feedbackShowViews")}</p>
                <p className="text-xs text-muted-foreground">{t("feedbackShowViewsDesc")}</p>
              </div>
              <Switch
                checked={board.show_views}
                disabled={busy || !isOwner}
                onCheckedChange={(v) =>
                  void mutate(() =>
                    api(settingsPath, {
                      method: "PATCH",
                      body: JSON.stringify({ show_views: v }),
                    })
                  )
                }
              />
            </div>
            {board.show_views &&
              (sharedViews.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("feedbackNoSharedViews")}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {sharedViews.map((view) => {
                    const checked = board.visible_view_ids.includes(view.id);
                    return (
                      <label
                        key={view.id}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          disabled={busy || !isOwner}
                          onCheckedChange={(next) => {
                            const ids = next
                              ? [...board.visible_view_ids, view.id]
                              : board.visible_view_ids.filter((id) => id !== view.id);
                            void mutate(() =>
                              api(settingsPath, {
                                method: "PATCH",
                                body: JSON.stringify({ visible_view_ids: ids }),
                              })
                            );
                          }}
                        />
                        {view.name}
                      </label>
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        {board && (
          <div className="flex flex-col gap-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t("feedbackIdentityTitle")}
            </p>

            <div className="flex flex-col gap-0.5">
              <p className="text-sm">{t("feedbackIdentityOtpTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("feedbackIdentityOtpDesc")}</p>
            </div>

            <div
              className={cn(
                "flex flex-col gap-2 rounded-md border px-3 py-2.5",
                "border-brand/30 bg-brand/5"
              )}
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">SSO</p>
                <Badge variant="secondary" className="border-brand/30 text-brand">
                  {t("feedbackSsoRecommended")}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("feedbackSsoDesc")}
              </p>

              {isOwner ? (
                board.sso_secret ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={board.sso_secret}
                        className="font-mono text-xs"
                      />
                      <CopyButton value={board.sso_secret} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("feedbackSsoSnippetHint")}
                    </p>
                    <code className="block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                      {publicUrl ?? `${origin}/f/…`}?sso=&lt;jwt&gt;
                    </code>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void post("rotate_sso")}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <RefreshCw className="size-3" />
                        {t("feedbackSsoRotate")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void post("clear_sso")}
                        className="text-xs text-destructive/80 transition-colors hover:text-destructive"
                      >
                        {t("feedbackSsoClear")}
                      </button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    disabled={busy}
                    onClick={() => void post("rotate_sso")}
                  >
                    {busy && <Spinner />}
                    {t("feedbackSsoGenerate")}
                  </Button>
                )
              ) : (
                board.sso_configured && (
                  <p className="text-xs text-muted-foreground">✓ {t("feedbackActive")}</p>
                )
              )}
            </div>
          </div>
        )}
      </ChannelCard>

      {/* ── Canal 2 : API serveur-à-serveur ────────────────────────────── */}
      <ChannelCard
        title={t("feedbackChannelApiTitle")}
        description={t("feedbackChannelApiDesc")}
        action={
          feedbackKeyCount > 0 ? (
            <Badge variant="secondary" className="shrink-0 border-brand/30 text-brand">
              {t("feedbackActive")}
            </Badge>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2 border-t pt-3">
          <code className="block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
            POST /api/v1/feedback · {"{ title, body?, user: { external_id?, email?, name? } }"}
          </code>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("feedbackApiKeysCount", { count: feedbackKeyCount })}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${projectId}/settings?tab=integrations`}>
                {t("feedbackApiManageKeys")}
              </Link>
            </Button>
          </div>
        </div>
      </ChannelCard>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
    </Button>
  );
}
