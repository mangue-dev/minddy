"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmDeleteDialog,
  Input,
  Skeleton,
  Spinner,
  Switch,
  cn,
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
} from "lucide-react";
import { getAppEnv } from "@/lib/env";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import {
  CustomDomainSection,
  fetchCustomDomainApi,
} from "@/components/custom-domain-section";
import {
  BoardAccentRow,
  BoardVisibilityRows,
  FeedbackTranslationGroup,
  NumoReviewGroup,
  StatusPill,
  feedbackDomainKey,
  useFeedbackBoardSettings,
  type BoardSettings,
} from "@/components/feedback/feedback-settings-shared";
import { FeedbackSetupWizard } from "@/components/feedback/feedback-setup-wizard";
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
 *
 * **La page n'est plus la porte d'entrée** : le wizard de configuration l'est
 * ([feedback-setup-wizard.tsx](feedback/feedback-setup-wizard.tsx)). Tant
 * qu'aucun canal n'est ouvert, l'onglet ne montre QUE lui — une liste
 * d'interrupteurs éteints ne dit pas par où commencer, et le premier réglage à
 * prendre (comment les retours arrivent) commande tous les autres. Une fois un
 * canal en place, les cartes reviennent : on retouche un détail sans refaire le
 * parcours.
 *
 * Les rangées et les cartes sont partagées avec le wizard
 * ([feedback-settings-shared.tsx](feedback/feedback-settings-shared.tsx)) : les
 * deux surfaces montrent le même interrupteur et écrivent par la même route.
 */

export function ProjectFeedbackSettings({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");
  const [wizardOpen, setWizardOpen] = useState(false);
  const { board, sharedViews, isPending, busy, patchBoard, patchBoardDebounced, post } =
    useFeedbackBoardSettings(projectId);

  // Domaine personnalisé (MIN-36) — même query que la CustomDomainSection
  // (dédupliquée par React Query) pour préférer le domaine vérifié dans l'URL.
  const domainPath = `/api/projects/${projectId}/feedback/domain`;
  const { data: domainData } = useQuery({
    queryKey: feedbackDomainKey(projectId),
    queryFn: () => fetchCustomDomainApi(domainPath),
    enabled: Boolean(board?.enabled),
  });
  const verifiedDomain =
    domainData?.domain?.status === "verified" ? domainData.domain.domain : null;

  const { integrations } = useIntegrationsQuery(projectId);
  const feedbackKeyCount = integrations.filter(
    (i) => i.kind === "feedback" && !i.revoked_at,
  ).length;

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
  /**
   * Le même board, servi par l'environnement qu'on regarde.
   *
   * Un domaine personnalisé est un enregistrement DNS : il pointe sur la
   * production, et ignore qu'il existe un localhost et une préversion. Depuis
   * l'un des deux, le lien ci-dessus emmène donc voir le board de PROD — jamais
   * celui qu'on est en train de modifier.
   *
   * La ligne n'existe qu'ici, hors production : en prod les deux URLs mèneraient
   * au même endroit, et une deuxième adresse à côté de la bonne ne ferait
   * qu'encombrer l'écran de quiconque n'a rien à déboguer.
   */
  const envUrl =
    verifiedDomain && board && getAppEnv() !== "production"
      ? `${origin}/f/${board.token}`
      : null;
  const boardOn = board?.enabled ?? false;
  /** Un canal ouvert quelque part : c'est ce qui fait exister la configuration. */
  const configured = boardOn || feedbackKeyCount > 0;

  // Rien d'ouvert : la scène, et rien d'autre. Le geste est le wizard — un
  // membre qui n'y a pas droit lit la scène et sait quoi demander au owner.
  if (!configured) {
    return (
      <div className="flex flex-col gap-6">
        <FeedbackWizardMount
          projectId={projectId}
          isOwner={isOwner}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
        />
        <EmptyScene icon={MessagesSquare} title={t("feedbackSetupEmptyTitle")}>
          {isOwner && (
            <Button onClick={() => setWizardOpen(true)}>
              {t("feedbackSetupButton")}
            </Button>
          )}
        </EmptyScene>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* La MÊME place dans l'arbre que dans la branche « rien d'ouvert »
          au-dessus : allumer le board à la première étape fait basculer la page
          d'une branche à l'autre, et un wizard remonté à ce moment-là repartirait
          de son étape 1 sous les doigts de l'utilisateur. */}
      <FeedbackWizardMount
        projectId={projectId}
        isOwner={isOwner}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      {/* ── Le parcours complet, en tête : c'est par lui qu'on configure ── */}
      {isOwner && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-brand/25 bg-brand/5 p-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-medium">{t("feedbackSetupTitle")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("feedbackSetupDesc")}
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => setWizardOpen(true)}
          >
            {t("feedbackSetupButtonAgain")}
          </Button>
        </div>
      )}

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
        {boardOn && board && (
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
              {envUrl && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium">{t("feedbackUrlThisEnv")}</p>
                  <PublicUrlLink url={envUrl} />
                  <p className="text-xs text-muted-foreground">
                    {t("feedbackUrlThisEnvHint")}
                  </p>
                </div>
              )}
              <CustomDomainSection
                endpoint={domainPath}
                queryKey={feedbackDomainKey(projectId)}
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
                    board.sso_configured ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {board.sso_configured
                    ? t("feedbackIdentitySso")
                    : t("feedbackIdentityEmail")}
                </span>
              }
            >
              {isOwner && (
                <SsoSetup
                  board={board}
                  busy={busy}
                  onPost={post}
                  publicUrl={publicUrl}
                  origin={origin}
                />
              )}
            </SettingsRow>

            {/* Commentaires publics, onglets de vues, catégories — les mêmes
                rangées que l'étape « Ce que voit le public » du wizard. */}
            <BoardVisibilityRows
              board={board}
              sharedViews={sharedViews}
              isOwner={isOwner}
              onPatch={patchBoard}
            />

            {/* Couleur d'accent du board public (MIN-59) — optionnelle, une par
                thème ; off par défaut = bleu minddy. */}
            <BoardAccentRow
              board={board}
              isOwner={isOwner}
              onToggle={patchBoard}
              onColorChange={patchBoardDebounced}
            />
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
      <NumoReviewGroup
        projectId={projectId}
        isOwner={isOwner}
        anchor={SETTINGS_SECTIONS.projectFeedbackReview}
      />

      {/* ── Traduction : une étape de la même passe ─────────────────────── */}
      <FeedbackTranslationGroup
        projectId={projectId}
        isOwner={isOwner}
        anchor={SETTINGS_SECTIONS.projectFeedbackTranslation}
      />
    </div>
  );
}

/**
 * Le wizard, monté au même endroit dans les deux états de la page — et
 * seulement pour le owner, qui est le seul à pouvoir provisionner un board ou
 * fabriquer une clé. Le nommer plutôt que de recopier ses quatre props aux deux
 * endroits, c'est ce qui garantit qu'il reste UNE seule place dans l'arbre.
 */
function FeedbackWizardMount({
  projectId,
  isOwner,
  open,
  onOpenChange,
}: {
  projectId: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!isOwner) return null;
  return (
    <FeedbackSetupWizard
      projectId={projectId}
      isOwner={isOwner}
      open={open}
      onOpenChange={onOpenChange}
    />
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
  onPost: (action: string) => Promise<boolean>;
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
        onConfirm={async () => {
          await onPost("rotate_sso");
        }}
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
