"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, Copy01Icon, LinkSquare01Icon, MessageMultiple01Icon, MoreHorizontalIcon, Refresh01Icon, CheckIcon, Settings02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { useIntegrationsQuery } from "@/lib/use-integrations-query";
import {
  BoardAccentRow,
  BoardVisibilityRows,
  FeedbackTranslationGroup,
  NumoReviewGroup,
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
  const publicUrl = board ? `${origin}/f/${board.token}` : null;
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
        <EmptyScene icon={MessageMultiple01Icon} title={t("feedbackSetupEmptyTitle")}>
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
    // The same gap between cards as every other settings tab.
    <div className="flex flex-col gap-8">
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
        <SettingsGroup
          title={t("feedbackSetupTitle")}
          help={t("feedbackSetupDesc")}
          action={
            <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}>
              <HugeiconsIcon icon={Settings02Icon} />
              {t("feedbackSetupButtonAgain")}
            </Button>
          }
        />
      )}

      {/* Public feedback board */}
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectFeedbackBoard}
        title={t("feedbackChannelBoardTitle")}
        help={t("feedbackChannelBoardHelp")}
        action={
          <Switch
            checked={boardOn}
            disabled={!isOwner || busy}
            onCheckedChange={(v) => {
              void patchBoard({ enabled: v });
            }}
            aria-label={t("feedbackChannelBoardTitle")}
          />
        }
      >
        {boardOn && board && (
          <>
            {publicUrl && <PublicUrlRow url={publicUrl} />}

            {/* Visitor identity: the mode in force, and the SSO gestures for
                the owner. */}
            <SsoRow
              board={board}
              isOwner={isOwner}
              busy={busy}
              onPost={post}
              publicUrl={publicUrl}
              origin={origin}
            />

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
        title={t("feedbackChannelApiTitle")}
        help={t("feedbackChannelApiHelp")}
      >
        {/* One row, whatever the count: the keys themselves live in the
            Integrations tab, where they are created and revoked. */}
        <SettingsRow
          label={t("feedbackApiKeysCount", { count: feedbackKeyCount })}
          control={<ManageKeysButton projectId={projectId} />}
        />
      </SettingsGroup>

      {/* ── Numo review: applies to the three channels ────────────────── */}
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

/** Referral to the Integrations tab, where keys are created and revoked. */
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

/** The public address of the board: shown as the row's hint, opened in a
 *  new tab or copied from the row's controls. */
function PublicUrlRow({ url }: { url: string }) {
  const t = useTranslations("Settings");
  return (
    <SettingsRow
      label={t("feedbackUrl")}
      hint={<span className="font-mono">{url.replace(/^https?:\/\//, "")}</span>}
      control={
        <>
          <CopyButton value={url} />
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <HugeiconsIcon icon={LinkSquare01Icon} />
              {t("feedbackOpenBoard")}
            </a>
          </Button>
        </>
      }
    />
  );
}

/** Visitor identity (MIN-37). The hint says which mode is in force; the
 * owner enables SSO from the row, and once it is on manages it from a menu
 * (regenerate, disable) while the signing secret sits under the row.
 *
 * The secret is displayed and copied as an ENVIRONMENT LINE
 * (`MINDDY_SSO_SECRET=…`), no bare key: that's the only thing we do with it,
 * and the integration prompt no longer carries the secret — it names this
 * variable and relies on it. Pasting the key alone in a `.env` would not
 * work, so what is shown is exactly what is expected there. */
function SsoRow({
  board,
  isOwner,
  busy,
  onPost,
  publicUrl,
  origin,
}: {
  board: BoardSettings;
  isOwner: boolean;
  busy: boolean;
  onPost: (action: string) => Promise<boolean>;
  publicUrl: string | null;
  origin: string;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const [reveal, setReveal] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const envLine = isOwner && board.sso_secret ? ssoEnvLine(board.sso_secret) : null;

  let control: React.ReactNode = null;
  if (isOwner && !envLine) {
    control = (
      <>
        {/* A plain label, not a pill: next to the button a pill read as a
            second button. */}
        <span className="text-xs font-medium text-brand">{t("feedbackSsoRecommended")}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void onPost("rotate_sso")}
        >
          {busy && <Spinner />}
          {t("feedbackSsoGenerate")}
        </Button>
      </>
    );
  } else if (envLine) {
    control = (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={t("feedbackSsoActions")}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirmRotate(true)}>
            <HugeiconsIcon icon={Refresh01Icon} />
            {t("feedbackSsoRotate")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void onPost("clear_sso")}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
            {t("feedbackSsoClear")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <SettingsRow
      label={t("feedbackIdentityTitle")}
      help={t("feedbackIdentityHelp")}
      hint={board.sso_configured ? t("feedbackIdentitySso") : t("feedbackIdentityEmail")}
      control={control}
    >
      {envLine && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("feedbackSsoSecretLabel")}</p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label={t("feedbackSsoSecretLabel")}
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
              <HugeiconsIcon icon={reveal ? ViewOffIcon : ViewIcon} className="size-4" />
            </Button>
            <CopyButton value={envLine} />
          </div>

          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:text-foreground">
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
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
      )}
    </SettingsRow>
  );
}

function CopyButton({ value }: { value: string }) {
  const tc = useTranslations("Common");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? tc("copied") : tc("copy")}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <HugeiconsIcon icon={CheckIcon} className="size-4 text-emerald-500" /> : <HugeiconsIcon icon={Copy01Icon} className="size-4" />}
    </Button>
  );
}
