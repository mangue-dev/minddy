"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  ColorInput,
  ConfirmDeleteDialog,
  Input,
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
  MessagesSquare,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { DEFAULT_BOARD_ACCENT } from "@/lib/feedback/accent";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { useProjects } from "@/lib/projects-context";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import {
  CustomDomainSection,
  fetchCustomDomainApi,
} from "@/components/custom-domain-section";
import { FeedbackIntegrationWizard } from "@/components/feedback-integration-wizard";
import { EmptyScene } from "@/components/empty-scene";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Onglet Feedback des settings (MIN-37). Deux canaux publics cumulables — le
 * board de votes et l'API serveur-à-serveur (la saisie interne par l'équipe est
 * toujours active). Chaque réglage tient sur une rangée : libellé + contrôle,
 * et les explications longues (SSO, payload API) vivent derrière une icône ⓘ ou
 * un repli, pour que la config reste lisible d'un coup d'œil.
 *
 * C'est ici qu'a été inventé le patron carte + rangée que tous les écrans de
 * réglages emploient depuis MIN-167. Ses `Channel` et `Row` locaux ont donc été
 * SUPPRIMÉS au profit de `SettingsGroup` / `SettingsRow` : la source du patron
 * doit en être un consommateur, sinon les deux redivergent au premier ajustement.
 */

interface BoardSettings {
  enabled: boolean;
  show_views: boolean;
  visible_view_ids: string[];
  show_categories: boolean;
  accent_light: string | null;
  accent_dark: string | null;
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

  const { data, isPending } = useQuery({
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

  // Accent (MIN-59) : le picker `ColorInput` émet en continu pendant le drag. On
  // patche le cache tout de suite (le swatch suit le doigt) mais on debounce
  // l'appel réseau pour ne pas spammer la DB. Échec → resync depuis le serveur.
  const accentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchBoardDebounced = (body: Partial<BoardSettings>) => {
    const key = ["feedback-settings", projectId];
    queryClient.setQueryData<FeedbackSettingsData>(key, (old) =>
      old && old.board ? { ...old, board: { ...old.board, ...body } } : old,
    );
    if (accentTimer.current) clearTimeout(accentTimer.current);
    accentTimer.current = setTimeout(() => {
      api(settingsPath, { method: "PATCH", body: JSON.stringify(body) }).catch((e) => {
        toast.error((e as Error).message);
        void queryClient.invalidateQueries({ queryKey: key });
      });
    }, 350);
  };

  if (isPending) {
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
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectFeedbackBoard}
        icon={MessagesSquare}
        title={t("feedbackChannelBoardTitle")}
        description={t("feedbackChannelBoardDesc")}
        help={t("feedbackChannelBoardHelp")}
        action={
          <>
            <StatusPill
              active={boardOn}
              label={boardOn ? t("feedbackActive") : t("feedbackInactive")}
            />
            <Switch
              checked={boardOn}
              disabled={!isOwner}
              onCheckedChange={(v) => void patchBoard({ enabled: v })}
              aria-label={t("feedbackChannelBoardTitle")}
            />
          </>
        }
      >
        {boardOn && (
          <>
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
            <SettingsRow
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
            </SettingsRow>

            {/* Onglets des vues partagées */}
            {board && (
              <SettingsRow
                label={t("feedbackShowViews")}
                hint={t("feedbackShowViewsDesc")}
                control={
                  <Switch
                    checked={board.show_views}
                    disabled={!isOwner}
                    onCheckedChange={(v) => void patchBoard({ show_views: v })}
                    aria-label={t("feedbackShowViews")}
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
              </SettingsRow>
            )}

            {/* Catégories des posts sur le board public (MIN-52) — off par
                défaut : les catégories restent internes au dashboard équipe. */}
            {board && (
              <SettingsRow
                label={t("feedbackShowCategories")}
                hint={t("feedbackShowCategoriesDesc")}
                control={
                  <Switch
                    checked={board.show_categories}
                    disabled={!isOwner}
                    onCheckedChange={(v) => void patchBoard({ show_categories: v })}
                    aria-label={t("feedbackShowCategories")}
                  />
                }
              />
            )}

            {/* Couleur d'accent du board public (MIN-59) — optionnelle, une par
                thème ; off par défaut = bleu minddy. */}
            {board && (
              <AccentColorSetting
                board={board}
                isOwner={isOwner}
                onToggle={patchBoard}
                onColorChange={patchBoardDebounced}
              />
            )}
          </>
        )}
      </SettingsGroup>

      {/* ── Canal 2 : les clés que porte votre backend ──────────────────── */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectFeedbackApi}
        icon={Code2}
        title={t("feedbackChannelApiTitle")}
        description={t("feedbackChannelApiDesc")}
        help={t("feedbackChannelApiHelp")}
        /* Le geste vit en bout de titre ; sans clé active il descend dans la
           scène et n'est pas montré deux fois — comme l'onglet Intégrations. */
        action={
          feedbackKeyCount > 0 ? (
            <>
              <StatusPill active label={t("feedbackActive")} />
              <ManageKeysButton projectId={projectId} />
            </>
          ) : undefined
        }
      >
        {feedbackKeyCount === 0 ? (
          // Le libellé « aucune » du pluriel EST la phrase de la scène : la
          // dire deux fois, c'est la voir diverger.
          <EmptyScene
            size="compact"
            icon={Code2}
            title={t("feedbackApiKeysCount", { count: 0 })}
          >
            <ManageKeysButton projectId={projectId} />
          </EmptyScene>
        ) : (
          <p className="py-3.5 text-xs text-muted-foreground">
            {t("feedbackApiKeysCount", { count: feedbackKeyCount })}
          </p>
        )}
      </SettingsGroup>

      {/* ── Revue par Numo : s'applique aux trois canaux ────────────────── */}
      <NumoReviewSetting projectId={projectId} isOwner={isOwner} />
    </div>
  );
}

/** Le renvoi vers l'onglet Intégrations, où les clés se créent et se révoquent —
 *  en-tête de carte quand il y en a, dans la scène vide quand il n'y en a pas. */
function ManageKeysButton({ projectId }: { projectId: string }) {
  const t = useTranslations("Settings");
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={`/projects/${projectId}/settings?tab=integrations`}>
        {t("feedbackApiManageKeys")}
      </Link>
    </Button>
  );
}

/**
 * Revue par Numo — l'étape qui catégorise, filtre et modère chaque retour avant
 * publication. Deux interrupteurs, sur le projet (pas sur le board : la revue
 * couvre aussi l'API et la saisie interne).
 *
 * Le second n'existe que tant que le premier est armé : il ne répond qu'à la
 * question « et si le budget IA est épuisé ? ». Désarmer la revue est possible
 * mais déconseillé, d'où l'avertissement en clair plutôt qu'un simple libellé.
 */
function NumoReviewSetting({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const { projects, updateProject } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  // Miroir local pour que les switches suivent le doigt, puis reconciliation
  // depuis le projet (refetch) — le pattern de SmartAssignSection.
  const [reviewOn, setReviewOn] = useState(project?.feedback_review_enabled !== false);
  const [skipOn, setSkipOn] = useState(
    project?.feedback_review_skip_over_budget === true,
  );
  useEffect(() => {
    if (!project) return;
    setReviewOn(project.feedback_review_enabled !== false);
    setSkipOn(project.feedback_review_skip_over_budget === true);
  }, [project]);

  if (!project) return null;

  const patch = async (
    field: "feedback_review_enabled" | "feedback_review_skip_over_budget",
    next: boolean,
    revert: (value: boolean) => void,
  ) => {
    revert(next);
    try {
      await updateProject(projectId, { [field]: next });
    } catch (e) {
      revert(!next);
      toast.error((e as Error).message);
    }
  };

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectFeedbackReview}
      icon={Sparkles}
      title={t("feedbackReviewTitle")}
      description={t("feedbackReviewDesc")}
      help={t("feedbackReviewHelp")}
      action={
        <>
          <StatusPill
            active={reviewOn}
            label={reviewOn ? t("feedbackActive") : t("feedbackInactive")}
          />
          <Switch
            checked={reviewOn}
            disabled={!isOwner}
            onCheckedChange={(v) =>
              void patch("feedback_review_enabled", v, setReviewOn)
            }
            aria-label={t("feedbackReviewTitle")}
          />
        </>
      }
    >
      {!reviewOn && (
        <div className="py-3.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-600 dark:text-amber-500">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {t("feedbackReviewOffWarning")}
          </p>
        </div>
      )}
      {reviewOn && (
        <SettingsRow
          label={t("feedbackReviewSkipLabel")}
          hint={t("feedbackReviewSkipDesc")}
          control={
            <Switch
              checked={skipOn}
              disabled={!isOwner}
              onCheckedChange={(v) =>
                void patch("feedback_review_skip_over_budget", v, setSkipOn)
              }
              aria-label={t("feedbackReviewSkipLabel")}
            />
          }
        />
      )}
    </SettingsGroup>
  );
}

/** Couleur d'accent du board (MIN-59) : switch optionnel qui révèle deux
 *  `ColorInput` (clair/sombre). Off = accents null → bleu minddy par défaut.
 *  Activer amorce les deux couleurs sur le défaut pour donner un point de départ. */
function AccentColorSetting({
  board,
  isOwner,
  onToggle,
  onColorChange,
}: {
  board: BoardSettings;
  isOwner: boolean;
  onToggle: (body: Partial<BoardSettings>) => void | Promise<void>;
  onColorChange: (body: Partial<BoardSettings>) => void;
}) {
  const t = useTranslations("Settings");
  const custom = board.accent_light !== null || board.accent_dark !== null;

  return (
    <SettingsRow
      label={t("feedbackAccentTitle")}
      hint={t("feedbackAccentDesc")}
      control={
        <Switch
          checked={custom}
          disabled={!isOwner}
          aria-label={t("feedbackAccentTitle")}
          onCheckedChange={(v) =>
            void onToggle(
              v
                ? {
                    accent_light: board.accent_light ?? DEFAULT_BOARD_ACCENT,
                    accent_dark: board.accent_dark ?? DEFAULT_BOARD_ACCENT,
                  }
                : { accent_light: null, accent_dark: null },
            )
          }
        />
      }
    >
      {custom && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("feedbackAccentLight")}
            </span>
            <ColorInput
              value={board.accent_light ?? DEFAULT_BOARD_ACCENT}
              onChange={(next) => onColorChange({ accent_light: next })}
              label={t("feedbackAccentLight")}
              disabled={!isOwner}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("feedbackAccentDark")}
            </span>
            <ColorInput
              value={board.accent_dark ?? DEFAULT_BOARD_ACCENT}
              onChange={(next) => onColorChange({ accent_dark: next })}
              label={t("feedbackAccentDark")}
              disabled={!isOwner}
            />
          </div>
        </div>
      )}
    </SettingsRow>
  );
}

/** Bloc SSO (owner). Non configuré → bouton d'activation + « Recommandé ».
 *  Configuré → secret copiable, détails techniques repliés, régénérer/désactiver.
 *
 *  Le secret s'affiche et se copie sous forme de LIGNE D'ENVIRONNEMENT
 *  (`MINDDY_SSO_SECRET=…`), pas de clé nue : c'est la seule chose qu'on en fasse,
 *  et le prompt d'intégration ne transporte plus le secret — il nomme cette
 *  variable et compte sur elle. Coller la clé seule dans un `.env` ne marcherait
 *  pas ; ce qui est montré est donc exactement ce qui est attendu là-bas. */
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

  const envLine = board.sso_secret ? ssoEnvLine(board.sso_secret) : null;

  if (!envLine) {
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
          value={envLine}
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
        <CopyButton value={envLine} />
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
