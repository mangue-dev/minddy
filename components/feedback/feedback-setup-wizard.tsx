"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Textarea, toast } from "mangue-ui";
import { Check, Copy, Globe, KeyRound, Mail, Plug } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  WizardDialog,
  type WizardStep,
} from "@/components/wizard/wizard-dialog";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import { CustomDomainSection } from "@/components/custom-domain-section";
import {
  BoardAccentRow,
  BoardVisibilityRows,
  FeedbackTranslationGroup,
  NumoReviewGroup,
  SettingsRows,
  feedbackDomainKey,
  feedbackSettingsKey,
  useFeedbackBoardSettings,
} from "@/components/feedback/feedback-settings-shared";
import {
  integrationsQueryKey,
  useIntegrationsQuery,
} from "@/lib/use-integrations-query";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import { ssoEnvLine } from "@/lib/feedback/env-lines";
import { integrationKeyEnvLine } from "@/lib/feedback/integration-contract";

/**
 * The returns configuration wizard — THE entry point to the tab
 * Returns, of which he became the first thing we see there.
 *
 * It descends from the “Integrate into my app” wizard (MIN-37), which only
 * generate an integration prompt, and it keeps the thread: we first respond to
 * the one question that decides everything — **how the returns arrive** — and
 * each next step flows from this answer. What has changed is that
 * CONFIGURE on the way instead of sending the user to set the same thing at
 * the hand just after:
 *
 * board → type → SSO → what the public sees → appearance → review → where the
 * plug in → prompt
 * API → type → review → where to plug it in → prompt
 *
 * The middle steps don't reinvent anything: they are the rows and the cards
 * from the Returns tab, imported as is
 * ([feedback-settings-shared.tsx](feedback-settings-shared.tsx)), and they
 * write LIVE by the same route. Hence the only notable side effect of
 * route: validate “board public” in the first step creates and turns on the
 * board right away, because without it the following steps would have nothing
 * to be settled. If the user goes back and goes back to the API, the board
 * is returned to the state in which it was found — but we only extinguish it if it is
 * WE who lit it.
 *
 * The final prompt has TWO destinations, both open in BOTH
 * modes :
 * • the clipboard, for the user's code agent (Claude Code,
 *    Cursor…) ;
 * • NUMO, in one click: the prompt initiates an agent conversation on the
 * project, and minddy's agent opens the pull request itself.
 *
 * What makes the second possible is that no prompt anymore carries
 * credential: the SSO secret like the API key lives in a variable
 * environment, and the wizard shows separately the LINE to paste in the `.env`.
 * To put a secret in one of these texts is to put it in a
 * conversation d'agent — donc l'un ne va pas sans l'autre.
 */

type Mode = "board" | "api";
type StepId = "type" | "sso" | "board" | "look" | "review" | "placement" | "done";

/** A placement instruction, not a specification. */
const PLACEMENT_MAX_CHARS = 500;

export function FeedbackSetupWizard({
  projectId,
  isOwner,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** The course provisions and creates secrets: reserved for the owner. */
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("board");
  const [sso, setSso] = useState(true);
  const [placement, setPlacement] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [keyCreated, setKeyCreated] = useState(false);
  /** The `.env` line that this prompt expects (SSO secret or key), if it expects one. */
  const [env, setEnv] = useState<{ line: string; description: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [envCopied, setEnvCopied] = useState(false);
  /** Did this journey light up the board itself? Only this case falls apart. */
  const [provisionedBoard, setProvisionedBoard] = useState(false);

  const {
    board,
    sharedViews,
    isPending,
    patchBoard,
    patchBoardDebounced,
    post,
  } = useFeedbackBoardSettings(projectId);
  const { integrations } = useIntegrationsQuery(projectId);
  const hasFeedbackKey = integrations.some(
    (i) => i.kind === "feedback" && !i.revoked_at,
  );

  // Numo can only work on a repository: without a git link, the option does not work
  // not show — a button that has nothing to clone is not worth a refusal.
  const { link } = useProjectGitLinkQuery(projectId);
  const canHandOffToNumo = !!link;

  /**
   * The journey opens on what is ALREADY in place, not on the values ​​by
   * default: someone who comes back to sort out a detail should not have to
   * re-choose what he chose last time. Only once per opening,
   * and only when the settings are loaded — sow on an unknown board
   * would amount to sowing in a vacuum.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || isPending) return;
    seeded.current = true;
    setMode(!board?.enabled && hasFeedbackKey ? "api" : "board");
    setSso(board?.sso_configured ?? true);
  }, [open, isPending, board, hasFeedbackKey]);

  // SSO only occurs for the board: in API mode, it is the calling app
  // who says in whose name she deposes. Neither do the board settings, for
  // same reason — there is none.
  const steps: StepId[] =
    mode === "board"
      ? ["type", "sso", "board", "look", "review", "placement", "done"]
      : ["type", "review", "placement", "done"];

  const reset = () => {
    setPlacement("");
    setStepIndex(0);
    setPrompt(null);
    setKeyCreated(false);
    setEnv(null);
    setCopied(false);
    setEnvCopied(false);
    setProvisionedBoard(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("feedbackWizardCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The automatic copy which follows the generation can be refused (it does not
      // does not leave with a click). Nothing to say here: the last step carries the
      // “Copy prompt” button, and HE leaves with a gesture.
    }
  };

  /**
   * Channel selection, APPLIED. The board must exist so that the three
   * next steps have something to fix — and go back to the API on
   * returned to the condition in which it was found.
   */
  const applyType = async () => {
    const alreadyOn = board?.enabled === true;
    setWorking(true);
    try {
      if (mode === "board") {
        if (!alreadyOn) {
          if (!(await patchBoard({ enabled: true }))) return;
          setProvisionedBoard(true);
        }
      } else if (provisionedBoard) {
        if (!(await patchBoard({ enabled: false }))) return;
        setProvisionedBoard(false);
      }
      setStepIndex((i) => i + 1);
    } finally {
      setWorking(false);
    }
  };

  /**
   * Visitor identity, APPLIED. The existing secret is never
   * regenerated (an integration in place would break silently) — it is not
   * deleted only if the user explicitly requests the other mode, which
   * says the card “email verification” when a secret exists.
   */
  const applySso = async () => {
    const configured = board?.sso_configured ?? false;
    if (sso === configured) {
      setStepIndex((i) => i + 1);
      return;
    }
    setWorking(true);
    try {
      if (!(await post(sso ? "rotate_sso" : "clear_sso"))) return;
      setStepIndex((i) => i + 1);
    } finally {
      setWorking(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/feedback/integration-prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            sso: mode === "board" ? sso : false,
            placement: placement.trim(),
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as {
        prompt?: string;
        key_created?: boolean;
        sso_secret?: string | null;
        api_key?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !data?.prompt) {
        throw new Error(data?.error || "Error");
      }
      setPrompt(data.prompt);
      setKeyCreated(data.key_created === true);
      // The credential that the prompt EXPECTS without carrying it. The API key is in
      // more disposable-on-display (no rereading possible): his sentence the
      // said, where the SSO secret remains viewable in the settings.
      setEnv(
        data.api_key
          ? {
              line: integrationKeyEnvLine("feedback", data.api_key),
              description: t("feedbackWizardEnvDescKey"),
            }
          : data.sso_secret
            ? {
                line: ssoEnvLine(data.sso_secret),
                description: t("feedbackWizardEnvDescSso"),
              }
            : null,
      );
      // The board/key could be provisioned: refresh the settings views.
      void queryClient.invalidateQueries({
        queryKey: feedbackSettingsKey(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: integrationsQueryKey(projectId),
      });
      await copyToClipboard(data.prompt);
      setStepIndex((i) => i + 1);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Entrust the prompt to Numo: same path as “launch an agent” from the
   * notebook (conversation draft without ticket + compose from the page
   * Agents), with the project already chosen. We go through composing it rather than
   * launch from here: the user rereads the instructions, chooses their model and its
   * basic branch — an agent run on its repository does not start with a click without
   * revue.
   */
  const handOffToNumo = () => {
    if (!prompt) return;
    setAgentComposeDraft({ kind: "free", prompt, projectId });
    handleOpenChange(false);
    router.push(`/agents?compose=${FREE_COMPOSE_PARAM}`);
  };

  const stepDefs: Record<StepId, WizardStep<StepId>> = {
    // The choice that decides everything else: where the returns live. Two
    // doors shown, of the same weight — but each takes far enough to
    // deserve its description, what the first step of the project wizard, where
    // the wordings are sufficient, no need to do.
    type: {
      id: "type",
      title: t("feedbackWizardTypeTitle"),
      subtitle: t("feedbackWizardTypeDesc"),
      wide: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("feedbackWizardTypeTitle")}
        >
          <WizardChoiceCard
            selected={mode === "board"}
            icon={Globe}
            label={t("feedbackWizardTypeBoard")}
            description={t("feedbackWizardTypeBoardDesc")}
            onSelect={() => setMode("board")}
          />
          <WizardChoiceCard
            selected={mode === "api"}
            icon={Plug}
            label={t("feedbackWizardTypeApi")}
            description={t("feedbackWizardTypeApiDesc")}
            onSelect={() => setMode("api")}
          />
        </div>
      ),
    },

    // The SSO is the one of the two that we recommend — but it is ALREADY chosen at
    // the opening, and a selected card says it better than a pellet
    // “recommended” placed next to it.
    sso: {
      id: "sso",
      title: t("feedbackWizardSsoTitle"),
      wide: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("feedbackWizardSsoTitle")}
        >
          <WizardChoiceCard
            selected={sso}
            icon={KeyRound}
            label={t("feedbackWizardSsoYes")}
            description={t("feedbackWizardSsoYesDesc")}
            onSelect={() => setSso(true)}
          />
          <WizardChoiceCard
            selected={!sso}
            icon={Mail}
            label={t("feedbackWizardSsoNo")}
            // Choosing the email when a secret exists DELETES this secret: the
            // card says it before the click, not a toast after.
            description={
              board?.sso_configured
                ? t("feedbackWizardSsoNoDescClear")
                : t("feedbackWizardSsoNoDesc")
            }
            onSelect={() => setSso(false)}
          />
        </div>
      ),
    },

    // From here the rows are those of the Returns tab and write
    // live: the board already exists, the “type” step has just turned it on.
    board: {
      id: "board",
      title: t("feedbackWizardBoardTitle"),
      subtitle: t("feedbackWizardBoardDesc"),
      wide: true,
      content: board ? (
        <SettingsRows>
          <BoardVisibilityRows
            board={board}
            sharedViews={sharedViews}
            isOwner={isOwner}
            onPatch={patchBoard}
          />
        </SettingsRows>
      ) : null,
    },

    look: {
      id: "look",
      title: t("feedbackWizardLookTitle"),
      subtitle: t("feedbackWizardLookDesc"),
      wide: true,
      content: (
        <div className="flex flex-col gap-4">
          {board && (
            <SettingsRows>
              <BoardAccentRow
                board={board}
                isOwner={isOwner}
                onToggle={patchBoard}
                onColorChange={patchBoardDebounced}
              />
            </SettingsRows>
          )}
          {/* The section is hidden alone without the VERCEL_* env: on a
 deployment which does not know how to plug in a domain, the step reduces
 to the color, which is exactly what it has to say. */}
          <CustomDomainSection
            endpoint={`/api/projects/${projectId}/feedback/domain`}
            queryKey={feedbackDomainKey(projectId)}
            className="rounded-xl border border-border bg-card p-4"
          />
        </div>
      ),
    },

    // The two cards on the page, as is: they carry their own
    // master switch, and the review and translation apply to
    // three channels — the step is therefore the same in both courses.
    review: {
      id: "review",
      title: t("feedbackWizardReviewTitle"),
      subtitle: t("feedbackWizardReviewDesc"),
      wide: true,
      content: (
        <div className="flex flex-col gap-4">
          <NumoReviewGroup projectId={projectId} isOwner={isOwner} />
          <FeedbackTranslationGroup projectId={projectId} isOwner={isOwner} />
        </div>
      ),
    },

    placement: {
      id: "placement",
      title: t("feedbackWizardPlacementTitle"),
      submitLabel: t("feedbackWizardGenerate"),
      content: (
        // Describing a location means telling its app — easier to say
        // than to type. The microphone is placed IN the field, and the transcript is added
        // following what is already written rather than overwriting it.
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Textarea
              autoFocus
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              placeholder={t("feedbackWizardPlacementPlaceholder")}
              aria-label={t("feedbackWizardPlacementTitle")}
              maxLength={PLACEMENT_MAX_CHARS}
              rows={5}
              className="min-h-32 resize-none pb-12"
            />
            <DictateButton
              floating
              disabled={generating}
              onTranscription={(text) =>
                setPlacement((current) =>
                  (current.trim() ? `${current.trim()} ${text}` : text).slice(
                    0,
                    PLACEMENT_MAX_CHARS,
                  ),
                )
              }
            />
          </div>
          {/* Generate, in API mode, MINTE a key. Say it before the click:
 configuration is already saved — closing here does not lose anything, and this is what makes renunciation possible. */}
          {mode === "api" && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("feedbackWizardPlacementKeyNote")}
            </p>
          )}
        </div>
      ),
    },

    // The prompt exists: the key could be created, the board provisioned. To come back
    // going backwards doesn't undo any of that — the stage is terminal.
    done: {
      id: "done",
      title: t("feedbackWizardDoneTitle"),
      subtitle: canHandOffToNumo
        ? t("feedbackWizardDoneDesc")
        : t("feedbackWizardCopied"),
      lockBack: true,
      submitLabel: t("integrationKeyDone"),
      // The prompt itself is not displayed: it is long, it is already in the
      // clipboard, and rereading it here learns nothing — it is the agent who
      // bed. There remains what requires a gesture, in the order in which it is done: the
      // line to put in the `.env` first (a key does not show up), then
      // the two possible destinations of the prompt, separated by their “or”.
      content: (
        <div className="flex flex-col gap-3 text-left">
          {/* The prompt no longer carries a credential: here it is, separately, under the
 only form that serves — the line of the .env file. */}
          {env && (
            <div className="flex flex-col gap-2 rounded-2xl border border-brand/25 bg-brand/5 p-4">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">
                  {t("feedbackWizardEnvTitle")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {env.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {env.line}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("feedbackWizardEnvCopy")}
                  onClick={() => {
                    void navigator.clipboard.writeText(env.line);
                    setEnvCopied(true);
                    setTimeout(() => setEnvCopied(false), 2000);
                  }}
                >
                  {envCopied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
              {keyCreated && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("feedbackWizardDoneKeyNote")}
                </p>
              )}
            </div>
          )}

          {/* First destination: the user's code agent. The prompt
 has already gone there on its own — this button is only there for the clipboard to be overwritten in the meantime. */}
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => prompt && void copyToClipboard(prompt)}
          >
            {copied ? (
              <Check className="size-4 text-emerald-500" />
            ) : (
              <Copy className="size-4" />
            )}
            {t("feedbackWizardCopy")}
          </Button>

          {/* The other: minddy's agent, on the deposit already linked to the project. */}
          {canHandOffToNumo && (
            <>
              <div className="mt-1 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs text-muted-foreground">
                  {tCommon("or")}
                </span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2"
                onClick={handOffToNumo}
              >
                <NumoIcon className="size-4" />
                {t("feedbackWizardNumoButton")}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("feedbackWizardNumoDesc")}
              </p>
            </>
          )}
        </div>
      ),
    },
  };

  // What a click next to it would take away. Nothing, as long as no step is validated;
  // nothing about the last one either, where closing IS the way to end — the question
  // is therefore only posed between the two.
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const atStake = stepIndex > 0 && currentStep !== "done";

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("feedbackWizardTitle")}
      steps={steps.map((id) => stepDefs[id])}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={working || generating}
      dismissConfirm={
        atStake
          ? {
              title: t("feedbackWizardQuitTitle"),
              description: t("feedbackWizardQuitDesc"),
              confirmLabel: t("feedbackWizardQuitConfirm"),
              cancelLabel: t("feedbackWizardQuitCancel"),
            }
          : undefined
      }
      onSubmit={(id) => {
        if (id === "type") void applyType();
        else if (id === "sso") void applySso();
        else if (id === "placement") void generate();
        else if (id === "done") handleOpenChange(false);
        else setStepIndex((i) => i + 1);
      }}
    />
  );
}
