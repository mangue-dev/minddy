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
import { FeedbackParticipantsGroup } from "@/components/feedback/feedback-participants-group";
import { FeedbackSetupWizard } from "@/components/feedback/feedback-setup-wizard";
import { EmptyScene } from "@/components/empty-scene";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Feedback tab of settings (MIN-37). Two cumulative public channels — the
 * voting board and the server-to-server API (internal input by the team is
 * always active). Each setting fits in one row: label + control,
 * and long explanations (SSO, payload API) live behind an icon ⓘ or
 * a fallback, so that the config remains readable at a glance.
 *
 * This is where the card + row pattern that all screens of
 * settings used since MIN-167. Its local `Channel` and `Row` were therefore
 * DELETED in favor of `SettingsGroup` / `SettingsRow`: the source of the pattern
 * must be a consumer, otherwise the two diverge again at the first adjustment.
 *
 * **The page is no longer the entry point**: the configuration wizard is
 * ([feedback-setup-wizard.tsx](feedback/feedback-setup-wizard.tsx)). Tant
 * no channel is open, the tab ONLY shows them — a list
 * of switches off doesn't say where to start, and the first setting to
 * take (how returns arrive) orders all others. Once a
 * channel in place, the cards come back: we touch up a detail without redoing the
 * parcours.
 *
 * Rows and cards are shared with the wizard
 * ([feedback-settings-shared.tsx](feedback/feedback-settings-shared.tsx)): the
 * two surfaces show the same switch and write by the same route.
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
  const {
    board,
    sharedViews,
    publishedPages,
    isPending,
    busy,
    patchBoard,
    patchBoardDebounced,
    post,
  } = useFeedbackBoardSettings(projectId);

  // Custom domain (MIN-36) — same query as CustomDomainSection
  // (deduplicated by React Query) to prefer the verified domain in the URL.
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
  // The verified custom domain becomes the board's referring URL.
  const publicUrl = verifiedDomain
    ? `https://${verifiedDomain}`
    : board
      ? `${origin}/f/${board.token}`
      : null;
  /**
   * The same board, served by the environment we are looking at.
   *
   * A custom domain is a DNS record: it points to the
   * production, and ignores that there is a localhost and a preview version. From
   * one of the two, the link above therefore takes you to see the PROD board — never
   * the one we are currently modifying.
   *
   * The line only exists here, outside production: in production the two URLs would lead
   * in the same place, and a second address next to the correct one would not
   * than cluttering the screen of anyone who has nothing to debug.
   */
  const envUrl =
    verifiedDomain && board && getAppEnv() !== "production"
      ? `${origin}/f/${board.token}`
      : null;
  const boardOn = board?.enabled ?? false;
  /** An open channel somewhere: this is what makes the configuration exist. */
  const configured = boardOn || feedbackKeyCount > 0;

  // Nothing open: the stage, and nothing else. The gesture is the wizard — a
  // member who is not entitled to it reads the scene and knows what to ask the owner.
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
      {/* The SAME place in the tree as in the “nothing open” branch
          above: turning on the board at the first step flips the page
          from one branch to another, and a wizard reassembled at that moment would leave again
          of its step 1 under the user's fingers. */}
      <FeedbackWizardMount
        projectId={projectId}
        isOwner={isOwner}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      {/* ── The complete route, in mind: it is through this that we configure ── */}
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
            {/* Public link + custom domain (MIN-36) merged: the link
                already shows the verified domain, so `primaryUrlShown` avoids
                repeat it. The domain section is hidden alone without env VERCEL_*. */}
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

            {/* Visitor identity */}
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

            {/* Public comments, views tabs, pages tabs, categories — the same
                rows as the “What the public sees” step of the wizard. */}
            <BoardVisibilityRows
              board={board}
              sharedViews={sharedViews}
              publishedPages={publishedPages}
              isOwner={isOwner}
              onPatch={patchBoard}
            />

            {/* Public board accent color (MIN-59) — optional, one per
                theme ; default off = minddy blue. */}
            <BoardAccentRow
              board={board}
              isOwner={isOwner}
              onToggle={patchBoard}
              onColorChange={patchBoardDebounced}
            />
          </>
        )}
      </SettingsGroup>

      {/* ── Channel 2: the keys your backend carries ──────────────────── */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectFeedbackApi}
        icon={Code2}
        title={t("feedbackChannelApiTitle")}
        description={t("feedbackChannelApiDesc")}
        help={t("feedbackChannelApiHelp")}
        /* The gesture lives at the end of the title; without an active key it goes down into the
           scene and is not shown twice — like the Integrations tab. */
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
          // The wording “none” in the plural IS the sentence in the scene: the
          // to say it twice is to see it diverge.
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

      {/* ── Translation: one step of the same pass ─────────────────────── */}
      <FeedbackTranslationGroup
        projectId={projectId}
        isOwner={isOwner}
        anchor={SETTINGS_SECTIONS.projectFeedbackTranslation}
      />

      {/* ── Delete a participant: the right to be forgotten, equipped (MIN-119) ─
          After the three channels, because it can't be fixed - it needs to be practiced,
          once, when someone asks. */}
      <FeedbackParticipantsGroup projectId={projectId} />
    </div>
  );
}

/**
 * The wizard, mounted in the same place in both states of the page — and
 * only for the owner, who is the only one who can provision a board or
 * make a key. Name it rather than copying its four props to both
 * places, this is what guarantees that there is only ONE place left in the tree.
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

/** Referral to the Integrations tab, where keys are created and revoked —
 * card header when there is one, in the empty scene when there is none. */
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

/** SSO block (owner). Not configured → activation button + “Recommended”.
 * Configured → secret copyable, technical details collapsed, refresh/disable.
 *
 * The secret is displayed and copied as an ENVIRONMENT LINE
 * (`MINDDY_SSO_SECRET=…`), no bare key: that's the only thing we do with it,
 * and the integration prompt no longer carries the secret — it names this
 * variable and rely on it. Pasting the key alone in a `.env` would not work
 * not ; so what is shown is exactly what is expected there. */
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

/** Public board URL rendered as a real link (opens a tab) + copy —
 *  replaces the former read-only field. */
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
