"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmDeleteDialog,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Spinner,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  MessagesSquare,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import {
  CustomDomainSection,
  fetchCustomDomainApi,
} from "@/components/custom-domain-section";
import { FeedbackIntegrationWizard } from "@/components/feedback-integration-wizard";

/**
 * Onglet Feedback des settings (MIN-37). Deux canaux publics cumulables — le
 * board de votes et l'API serveur-à-serveur (la saisie interne par l'équipe est
 * toujours active). Chaque réglage tient sur une rangée : libellé + contrôle,
 * et les explications longues (SSO, payload API) vivent derrière une icône ⓘ ou
 * un repli, pour que la config reste lisible d'un coup d'œil.
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

interface FeedbackSettingsData {
  board: BoardSettings | null;
  shared_views: SharedView[];
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

/** Petit ⓘ qui ouvre l'explication détaillée — sort la prose des réglages. */
function HelpHint({ children }: { children: ReactNode }) {
  const t = useTranslations("Settings");
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("feedbackLearnMore")}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 outline-hidden transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-w-xs text-xs leading-relaxed text-muted-foreground"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Pastille d'état : point coloré + libellé, pour lire le statut d'un coup. */
function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-brand" : "bg-muted-foreground/40",
        )}
      />
      {label}
    </span>
  );
}

/** Carte d'un canal : chip d'icône, titre + aide + statut, contrôle, et corps
 *  (rangées de réglage) séparé par un liseré, uniquement s'il y a du contenu. */
function Channel({
  icon: Icon,
  title,
  hint,
  help,
  status,
  control,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  help?: ReactNode;
  status?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card text-card-foreground">
      <header className="flex items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium">{title}</h3>
              {help && <HelpHint>{help}</HelpHint>}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
          </div>
        </div>
        {(status || control) && (
          <div className="flex shrink-0 items-center gap-2.5">
            {status}
            {control}
          </div>
        )}
      </header>
      {children && <div className="border-t border-border px-4">{children}</div>}
    </section>
  );
}

/** Rangée de réglage : libellé (+ aide) & indice à gauche, contrôle à droite,
 *  contenu déroulant en dessous. */
function Row({
  label,
  hint,
  help,
  control,
  children,
}: {
  label: string;
  hint?: string;
  help?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{label}</p>
            {help && <HelpHint>{help}</HelpHint>}
          </div>
          {hint && (
            <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
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
    (i) => i.kind === "feedback" && !i.revoked_at,
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

  // Optimiste (MIN-40) : patch le cache `board` tout de suite pour que le switch
  // suive le doigt, puis persiste ; revert + toast à l'échec. (post/mutate
  // gardent leur spinner : générer un secret SSO n'est pas un simple toggle.)
  const patchBoard = async (body: Partial<BoardSettings>) => {
    const key = ["feedback-settings", projectId];
    const previous = queryClient.getQueryData<FeedbackSettingsData>(key);
    queryClient.setQueryData<FeedbackSettingsData>(key, (old) =>
      old && old.board ? { ...old, board: { ...old.board, ...body } } : old,
    );
    try {
      await api(settingsPath, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      queryClient.setQueryData(key, previous);
      toast.error((e as Error).message);
    }
  };
  const post = (action: string) =>
    mutate(() => api(settingsPath, { method: "POST", body: JSON.stringify({ action }) }));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
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
  const boardOn = board?.enabled ?? false;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Intégrer dans mon app : prompt tout-en-un (owner : secrets) ── */}
      {isOwner && <FeedbackIntegrationWizard projectId={projectId} />}

      {/* ── Canal 1 : board public ─────────────────────────────────────── */}
      <Channel
        icon={MessagesSquare}
        title={t("feedbackChannelBoardTitle")}
        hint={t("feedbackChannelBoardDesc")}
        help={t("feedbackChannelBoardHelp")}
        status={
          <StatusPill
            active={boardOn}
            label={boardOn ? t("feedbackActive") : t("feedbackInactive")}
          />
        }
        control={
          <Switch
            checked={boardOn}
            disabled={!isOwner}
            onCheckedChange={(v) => void patchBoard({ enabled: v })}
          />
        }
      >
        {boardOn && (
          <div className="divide-y divide-border">
            {/* Lien public + domaine personnalisé (MIN-36) fusionnés : le lien
                affiche déjà le domaine vérifié, donc `primaryUrlShown` évite de
                le répéter. La section domaine se masque seule sans env VERCEL_*. */}
            <div className="flex flex-col gap-3 py-3.5">
              {publicUrl && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">{t("feedbackUrl")}</p>
                  <PublicUrlLink url={publicUrl} />
                </div>
              )}
              <CustomDomainSection
                endpoint={domainPath}
                queryKey={["feedback-domain", projectId]}
                primaryUrlShown
              />
            </div>

            {/* Identité des visiteurs */}
            <Row
              label={t("feedbackIdentityTitle")}
              help={t("feedbackIdentityHelp")}
              control={
                <span
                  className={cn(
                    "text-xs font-medium",
                    board?.sso_configured ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {board?.sso_configured
                    ? t("feedbackIdentitySso")
                    : t("feedbackIdentityEmail")}
                </span>
              }
            >
              {isOwner && board && (
                <SsoSetup
                  board={board}
                  busy={busy}
                  onPost={post}
                  publicUrl={publicUrl}
                  origin={origin}
                />
              )}
            </Row>

            {/* Onglets des vues partagées */}
            {board && (
              <Row
                label={t("feedbackShowViews")}
                hint={t("feedbackShowViewsDesc")}
                control={
                  <Switch
                    checked={board.show_views}
                    disabled={!isOwner}
                    onCheckedChange={(v) => void patchBoard({ show_views: v })}
                  />
                }
              >
                {board.show_views &&
                  (sharedViews.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("feedbackNoSharedViews")}
                    </p>
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
                              disabled={!isOwner}
                              onCheckedChange={(next) => {
                                const ids = next
                                  ? [...board.visible_view_ids, view.id]
                                  : board.visible_view_ids.filter(
                                      (id) => id !== view.id,
                                    );
                                void patchBoard({ visible_view_ids: ids });
                              }}
                            />
                            {view.name}
                          </label>
                        );
                      })}
                    </div>
                  ))}
              </Row>
            )}
          </div>
        )}
      </Channel>

      {/* ── Canal 2 : API serveur-à-serveur ────────────────────────────── */}
      <Channel
        icon={Code2}
        title={t("feedbackChannelApiTitle")}
        hint={t("feedbackChannelApiDesc")}
        help={t("feedbackChannelApiHelp")}
        status={
          feedbackKeyCount > 0 ? (
            <StatusPill active label={t("feedbackActive")} />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 py-3.5">
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
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground outline-hidden transition-colors hover:text-foreground">
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
              {t("feedbackApiEndpoint")}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <code className="mt-2 block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
                POST /api/v1/feedback ·{" "}
                {"{ title, body?, user: { external_id?, email?, name? } }"}
              </code>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </Channel>
    </div>
  );
}

/** Bloc SSO (owner). Non configuré → bouton d'activation + « Recommandé ».
 *  Configuré → secret copiable, détails techniques repliés, régénérer/désactiver. */
function SsoSetup({
  board,
  busy,
  onPost,
  publicUrl,
  origin,
}: {
  board: BoardSettings;
  busy: boolean;
  onPost: (action: string) => Promise<void>;
  publicUrl: string | null;
  origin: string;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const [reveal, setReveal] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  if (!board.sso_secret) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void onPost("rotate_sso")}
        >
          {busy && <Spinner />}
          {t("feedbackSsoGenerate")}
        </Button>
        <Badge variant="secondary" className="border-brand/30 text-brand">
          {t("feedbackSsoRecommended")}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-brand/25 bg-brand/5 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {t("feedbackSsoSecretLabel")}
      </p>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          type={reveal ? "text" : "password"}
          value={board.sso_secret}
          className="font-mono text-xs"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={reveal ? t("feedbackSsoHide") : t("feedbackSsoReveal")}
          onClick={() => setReveal((r) => !r)}
        >
          {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
        <CopyButton value={board.sso_secret} />
      </div>

      <Collapsible>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground outline-hidden transition-colors hover:text-foreground">
          <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
          {t("feedbackSsoDetails")}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("feedbackSsoSnippetHint")}
          </p>
          <code className="block overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
            {publicUrl ?? `${origin}/f/…`}?sso=&lt;jwt&gt;
          </code>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setConfirmRotate(true)}
        >
          <RefreshCw className="size-3.5" />
          {t("feedbackSsoRotate")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void onPost("clear_sso")}
          className="text-destructive hover:text-destructive"
        >
          {t("feedbackSsoClear")}
        </Button>
      </div>

      <ConfirmDeleteDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title={t("feedbackSsoRotateConfirmTitle")}
        description={t("feedbackSsoRotateConfirmDesc")}
        confirmLabel={t("feedbackSsoRotate")}
        cancelLabel={tc("cancel")}
        onConfirm={() => onPost("rotate_sso")}
      />
    </div>
  );
}

/** URL publique du board rendue comme un vrai lien (ouvre un onglet) + copier —
 *  remplace l'ancien champ en lecture seule. */
function PublicUrlLink({ url }: { url: string }) {
  const display = url.replace(/^https?:\/\//, "");
  return (
    <div className="flex items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="group flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs transition-colors hover:border-brand/40 hover:text-brand"
      >
        <span className="truncate">{display}</span>
        <ExternalLink className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
      </a>
      <CopyButton value={url} />
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
