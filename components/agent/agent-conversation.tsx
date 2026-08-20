"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  cn,
  Spinner,
  toast,
} from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { cumulativeBranchFiles, changeTotals } from "@/lib/agent-changed-files";
import { NumoIcon } from "@/components/numo-icon";
import { ChatInput } from "@/components/assistant/chat-input";
import { AskUserCard } from "@/components/assistant/ask-user-card";
import { parseAskUserQuestions, type AskUserQuestion } from "@/lib/ask-user";
import { unechoedMessages } from "@/lib/agent-pending";
import type { AgentComposeIntent } from "@/lib/agent-compose-draft";
import {
  heartbeatAgentRunApi,
  interruptAgentRunApi,
  isAgentRunActive,
  isAgentRunResumable,
  isAgentRunWorking,
  launchAgentRunApi,
  steerAgentRunApi,
  type AgentRunSummary,
} from "@/lib/agent-api";
import {
  agentRunDiffQueryKey,
  agentRunQueryKey,
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
  useAgentRunDiffStatQuery,
  useAgentRunEventsQuery,
  useAgentRunQuery,
  useIssueAgentRunsQuery,
} from "@/lib/use-agent-runs";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { isLocalAgentProvider } from "@/lib/agent-providers";
import { ModelBadge } from "@/components/model-badge";
import { ModelCombobox } from "./model-combobox";
import { BranchCombobox } from "./branch-combobox";
import { ReasoningCombobox } from "./reasoning-combobox";
import {
  EnvironmentCombobox,
  LOCAL_REPO_ERROR_KEYS,
  type AgentEnvironment,
} from "./environment-combobox";
import { useLocalRepo } from "@/lib/use-local-repo";
import { useAgentRunLive, useAgentRunLocalDiff } from "@/lib/use-agent-run-live";
import { mergeAgentLocalDiff, settledAgentLocalDiff } from "@/lib/agent-local-diff";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentDiffSheet } from "./agent-diff-sheet";
import { AgentActivityPill } from "./agent-activity-pill";
import { turnSubagents } from "@/lib/agent-subagents";
import { livePlan } from "@/lib/agent-plan";
import { useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import type { AssistantMention } from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import { MentionLinksProvider } from "@/components/mention-links";

/**
 * Code Agent Conversation Reusable Core (MIN-46 + MIN-68), extract
 * of the modal to be hosted as well in the floating `Sheet` (AgentChatModal)
 * that DIRECTLY in the Agents page (list/detail, without modal).
 *
 * This component shows ONE run — it's the conversation. A door exit
 * several, successive, only one of which can WORK at a time; they don't
 * choose more here (the middle selector of the header is gone) but in
 * the LIST on the Agents page, where each has their line and title. The host designates
 * so the one we open, and two modes are distinguished by the ENTRY POINT:
 *
 * • HOT (`live`) — the designated run (`initialRunId` / `noteRunId`), or failing that
 * the one who works, otherwise the last of the issue: the thread is its flow
 * of events and composing it speaks DIRECTLY to it (`/steer`), in its
 * context. At rest, the conversation CONTINUES thus, naturally — as
 * a cat. Only the LAST run of the outcome can be repeated; the previous ones
 * consult (the server applies the same rule).
 * • COLD (`compose`) — no run on the issue, or launch draft:
 * compose BLANK (the user says what he wants, no pre-written goal) +
 * model picker. Send launches a NEW run, which will inherit the server side of the
 *    branche/PR de l'issue.
 *
 * As long as the component is `active`, a heartbeat refreshes the idle clock
 * of the run so that the sandbox is not cut while reading or writing.
 *
 * The header is provided by the host: `headerTitle` (left block — the modal leaves
 * the default: live model / targeted issue composed; the page passes its own
 * title) and `headerActions` (right block — expand/close for the modal, return /
 * PR link for the page).
 */
export function AgentConversation({
  issueId = null,
  issueIdentifier = "",
  projectId = null,
  noteRunId = null,
  initialRunId = null,
  initialCompose = false,
  active = true,
  headerTitle,
  headerActions,
  onLaunched,
  initialComposeText,
  composeIntent = "implement",
}: {
  /** Anchor issue — null for a NOTEBOOK session (pass `noteRunId`). */
  issueId?: string | null;
  /** Readable identifier (MIN-42) — displayed in the header in phase compose. */
  issueIdentifier?: string;
  /** Project scope for @ mention suggestions and page resolution. */
  projectId?: string | null;
  /**
   * Session WITHOUT TICKET (MIN-84): the run IS the session — conversation of ONE
   * run, without outcome history or composite phase (the run already exists; the
   * composed of these sessions lives in SessionCompose, before any run).
   */
  noteRunId?: string | null;
  /**
   * Open THIS run — the one in the line clicked on the Agents page, the one that the
   * Exit sign reopens. Absent → the run that WORKS, otherwise the LAST
   * run no `failed` of the outcome, and without any run we compose.
   */
  initialRunId?: string | null;
  /**
   * Force the phase to compose at the opening (launch draft) even if the outcome
   * already has rest runs.
   */
  initialCompose?: boolean;
  /** Is the component visible/alive? Gate the question and the heartbeat. */
  active?: boolean;
  /** Left block of the header (default: live model / composite issue). */
  headerTitle?: ReactNode;
  /** Action block to the right of the header. */
  headerActions?: ReactNode;
  /**
   * Called as soon as a NEW run has just been launched from the compose phase (before
   * even if the list of sessions has not caught up). The Agents page uses it
   * to retain the id of the run during the transition compose → live.
   */
  onLaunched?: (run: AgentRunSummary) => void;
  /**
   * Pre-written prompt that initiates the compose in phase compose (request
   * implementation adapted to the outcome). One-shot: read when editing the composer, then
   * freely editable. Without it, the composer starts empty (“New run”, modal).
   */
  initialComposeText?: string;
  /**
   * What the entry point asked the agent: `plan` (“Generate plan” /
   * "Check plan") FRAMES the ticket without starting it — the server does not
   * then does not go “in progress”. Follows the draft, not the text of the composer:
   * the user remains free to rewrite the instruction.
   */
  composeIntent?: AgentComposeIntent;
}) {
  const t = useTranslations("Agent");
  const tToolCall = useTranslations("ToolCall");
  const queryClient = useQueryClient();
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId);

  /**
   * Numo's FAB fades as long as this conversation is on screen: his
   * composer is pinned at the bottom right, and the FAB falls right on its button
   * sending. It is declared HERE, by the component which carries this composer, rather
   * only by a list of routes — the Agents page shows us under its tab
   * Conversations but not under its Routines tab, at the same URL, and a
   * open routine on one of its passages takes us back again.
   */
  useSuppressAssistantFab(active);

  /** Translates an agent API error code, or lets the raw message pass. */
  const agentErrorMessage = useAgentErrorMessage();

  /**
   * Refreshes the anchor runs (issue OR run notebook) AND the global list of
   * sessions (Agents page). This list ONLY polls if a session is already working —
   * without explicit invalidation, start or resume a run from the page
   * leaves it frozen on the status of the previous run until the next reload.
   */
  const refreshRuns = async (): Promise<void> => {
    await Promise.all([
      issueId
        ? queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) })
        : Promise.resolve(),
      noteRunId
        ? queryClient.invalidateQueries({ queryKey: agentRunQueryKey(noteRunId) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey }),
    ]);
  };

  // Explicitly open run: `initialRunId`, a run chosen from the history,
  // or the one we just launched. `null` → we fall back on the ACTIVE run of the outcome.
  const [selectedId, setSelectedId] = useState<string | null>(initialRunId);
  // Run just launched: the query has not yet returned it, it has been displayed since
  // POST response → instantaneous live toggle, without phase compose flash.
  const [launched, setLaunched] = useState<AgentRunSummary | null>(null);
  // “Launch a new agent” requested explicitly: forces the phase to even compose
  // if the issue has past runs (otherwise we would reopen the last one).
  const [composing, setComposing] = useState(initialCompose);
  // Messages sent for which the server echo has not yet arrived (optimistic bubbles).
  const [pendingMessages, setPendingMessages] = useState<
    Array<{ text: string; mentions: AssistantMention[] }>
  >([]);
  // 1st message of a session being created: the launch POST does the
  // pre-checks (deposit, quota, model) before rendering the session, and during this
  // time there is nothing to display — the message has left the composer and does not exist
  // nowhere yet. We hold it here to show it right away.
  const [launchText, setLaunchText] = useState<string | null>(null);
  const [launchMentions, setLaunchMentions] = useState<AssistantMention[]>([]);
  // POST has not yet rendered the run: its `local_exec` is therefore not
  // available during the optimistic bubble. We keep the choice validated by the
  // local folder to never show “Opening sandbox” during
  // that a local tour is being prepared.
  const [launchLocalExec, setLaunchLocalExec] = useState(false);
  // “Create PR” request sent: deactivates the button while the agent
  // starts again (working) or RA appears. Reset by lower effect.
  const [requestingPr, setRequestingPr] = useState(false);
  // Diff view of the session (Sheet over the conversation): opened in
  // clicking a file blocks “files changed”, PR or not.
  const [diffOpen, setDiffOpen] = useState(false);
  // The file through which we entered: the view opens ABOVE. Click one
  // line to land at the top of a diff of forty files, it is to arrive at
  // next to what we asked for. `null` when the entry designates nothing (both
  // numbers in the header) — the view then opens normally, at the top.
  const [diffFocus, setDiffFocus] = useState<string | null>(null);
  // The conversation follows what the host points to. There is no longer a selector
  // runs here to compete for his hand: what the user chooses, he
  // chooses from the LIST, and the host passes it to us as prop.
  useEffect(() => {
    setSelectedId(initialRunId);
    setComposing(initialCompose);
  }, [initialRunId, initialCompose]);

  const { runs: issueRuns, loading: issueLoading } = useIssueAgentRunsQuery(
    active && issueId ? issueId : null,
  );
  // NOTEBOOK session: a single run, queried directly (it IS the session).
  const { run: noteRun, loading: noteLoading } = useAgentRunQuery(
    active && noteRunId ? noteRunId : null,
  );
  const runs = noteRunId ? (noteRun ? [noteRun] : []) : issueRuns;
  const loading = noteRunId ? noteLoading : issueLoading;
  // The run just launched is active but not yet in `runs`: without it, we
  // would suggest “launch a new agent” on an already occupied issue (→ 409).
  const knownRuns =
    launched && !runs.some((r) => r.id === launched.id) ? [launched, ...runs] : runs;

  const activeRun = knownRuns.find((r) => isAgentRunActive(r.status)) ?? null;
  // Resolution of the run displayed: the one designated, otherwise the one working,
  // otherwise the LAST run NO `failed` of the outcome — a conversation at rest occurs
  // PUSHED (conversational model), it does not fall back on a blank composition.
  // A `failed` run (dead at boot) has neither thread nor composer: take it by
  // default would open a dead conversation without visible action - we dial at the
  // place. The fallback is only used by callers WITHOUT a designated run (the modal of
  // resumption): the Agents page always opens the run of the clicked line.
  const liveRun = composing
    ? null
    : selectedId
      ? knownRuns.find((r) => r.id === selectedId) ?? null
      : activeRun ?? knownRuns.find((r) => r.status !== "failed") ?? null;
  /**
   * What the SERVER does — the truth of the requests (thread polling, diff,
   * decision to discontinue). To be distinguished from `working`, which is what
   * the INTERFACE says: “stopping” only sets a flag, that the loop
   * only reads at the edge of its round, several seconds later
   * (sometimes much more, if it is in full use of the model). During this time,
   * nothing moved on the screen: the button remained “stop”, the tour continued
   * to count, and we clicked again believing that it hadn't worked.
   */
  const serverWorking = liveRun ? isAgentRunWorking(liveRun.status) : false;
  const [stopping, setStopping] = useState(false);
  const working = serverWorking && !stopping;
  // `runs` arrives sorted from newest to oldest: runs[0] is the last run.
  // The run we just launched ALSO counts as the last: between POST and
  // the arrival of the refetch, `runs` is still the list from BEFORE, and compare it to
  // runs[0] would designate the previous run → we would display “past run, compose
  // disabled” on the run that the user has just started.
  const isLatest = liveRun ? knownRuns[0]?.id === liveRun.id : false;
  // Her PR is merged → run DELIVERED: waking her up would push on a branch already
  // in the database and would reopen a PR cycle on finished work (409 `prMerged`).
  const delivered = liveRun?.pr_state === "merged";
  // Does the dial speak to this run? Yes even finished (hot restart) — alone
  // `failed` has nothing to take back. But ONLY the last run can be repeated: the
  // runs from an issue share the branch, and a past run remained in a state
  // exceeded (his push would be rejected). We consult it; to continue, we launch
  // news. The server applies the same rules (409 `supersededRun` /
  // `prMerged`).
  const steerable = liveRun
    ? isAgentRunResumable(liveRun.status) && isLatest && !delivered
    : false;

  // Question ask_user ACTIVE (MIN-86): the last significant event of the thread is
  // a `question` (no user message or summary after) and the agent is at rest,
  // steerable, without response already in flight. The living card then replaces the
  // compose; compose; the feed hides the corresponding bubble. Same react-query query as
  // the feed (shared key) → no additional request.
  const { events: liveEvents } = useAgentRunEventsQuery(
    liveRun?.id ?? null,
    serverWorking
  );
  // The feed has its own reading to make the queue lively. This second
  // subscriber shares the same channel, but also makes Git counters local
  // available at the composer pill — a server route cannot read the
  // deposit that remains on the user's machine.
  const runLive = useAgentRunLive(liveRun?.id ?? null, serverWorking);
  const streamedLocalDiff = useAgentRunLocalDiff(
    liveRun?.local_exec ? liveRun.id : null,
    serverWorking,
  );
  const settledLocalDiff = useMemo(
    () => settledAgentLocalDiff(liveEvents),
    [liveEvents],
  );
  const localDiff = useMemo(
    () => mergeAgentLocalDiff(settledLocalDiff, streamedLocalDiff),
    [settledLocalDiff, streamedLocalDiff],
  );
  const useLocalDiff = liveRun?.local_exec === true && (!liveRun.local_worktree || serverWorking);

  /**
   * What THIS session changed in the deposit, cumulative over all its turns (union
   * events `files_changed`, real git counters). This is the information that
   * carried the bar above the dial; the pill doesn't show any now
   * that the countdown — the complete list remains one click away in the diff and under
   * every reply in the thread.
   *
   * No more requests: these are the events that the thread already loads.
   */
  const sessionFiles = useMemo(
    () => cumulativeBranchFiles(liveEvents).files,
    [liveEvents],
  );
  /**
   * THE SAME TWO NUMBERS, BUT DURING THE TURN (MIN-266).
   *
   * `files_changed` is only issued at the END of the turn: as long as the agent was working,
   * the header didn't move a digit — and on the first turn of a session it
   * displayed nothing at all, even though this is exactly the moment we want
   * know what is happening to the repository. This summary is read in the
   * microVM (`git diff`, without patches) and therefore progresses with the work.
   *
   * It only turns during the turn; at rest the events take control again,
   * and they are already loaded.
   */
  const { files: liveDiffFiles } = useAgentRunDiffStatQuery(liveRun?.id ?? null, working);
  const liveHeaderFiles = useMemo(() => {
    if (runLive?.fileStats.length) {
      // Events describe rounds that have already been completed; the local statement replaces
      // only the paths of the current tour and retains the rest of the session.
      const byPath = new Map(sessionFiles.map((file) => [file.path, file]));
      for (const file of runLive.fileStats) byPath.set(file.path, file);
      return [...byPath.values()];
    }
    return liveDiffFiles.length > 0 ? liveDiffFiles : sessionFiles;
  }, [liveDiffFiles, runLive?.fileStats, sessionFiles]);
  const sessionTotals = useMemo(
    // The direct is authentic as soon as it has something: it contains everything that
    // carry the events (commits from past rounds) PLUS the current round.
    () => changeTotals(liveHeaderFiles),
    [liveHeaderFiles],
  );
  /**
   * The sub-agents of the current turn (MIN-112) → indicator in the pill of the
   * compose. Read on the SAME events as the thread (shared react-query key):
   * no further requests.
   */
  const subagents = useMemo(
    () => (working ? turnSubagents(liveEvents) : []),
    [liveEvents, working],
  );
  /**
   * The checklist for the current round (`update_plan`) → indicator in the pill of the
   * compose. Same events as the thread, no additional requests. Empty as soon as
   * the agent is at rest: the plan describes work already completed.
   */
  const planSteps = useMemo(
    () => (working ? livePlan(liveEvents) : []),
    [liveEvents, working],
  );
  /**
   * THE QUESTION CARD, AND THE ROUND IS NO LONGER NECESSARILY ENDED (MIN-364, D7).
   *
   * On the user's machine, `ask_user` SUSPENDS the tour instead of
   * finish: the model waits, the agent remains `running`, and the event `question`
   * then carries `blocking: true`. Requiring rest would do the exact opposite
   * of what we want — a composer disarmed in the face of a model waiting for a
   * response, and a turn that only starts again on the deadline.
   *
   * Rest remains required for a NON-blocking question (the microVM path):
   * there, the card must only open once the trick is put away, otherwise it
   * would appear during the push and export of the log.
   */
  const activeQuestion = useMemo((): {
    eventId: string;
    questions: AskUserQuestion[];
    /** The trick WAITS for this response: responding to it doesn't trigger anything, it resolves it. */
    blocking: boolean;
  } | null => {
    if (!liveRun || !steerable) return null;
    const ordered = [...liveEvents].sort((a, b) => a.seq - b.seq);
    // Response already in flight? `pendingMessages` is NEVER purged on success
    // (cf. lib/agent-pending.ts — multi-set subtraction depends on it): we do not
    // account that sendings WITHOUT server echo, otherwise the first steering of the
    // session would delete the map until the page reloads.
    const echoed = ordered
      .filter((e) => e.type === "user_message")
      .map((e) => (typeof e.payload?.text === "string" ? e.payload.text : ""));
    if (liveRun.prompt?.trim()) echoed.push(liveRun.prompt);
    if (unechoedMessages(pendingMessages.map((message) => message.text), echoed).length > 0) {
      return null;
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const e = ordered[i];
      if (e.type === "user_message" || e.type === "summary") return null;
      if (e.type === "question") {
        const questions = parseAskUserQuestions(
          (e.payload ?? {}) as Record<string, unknown>
        );
        if (questions.length === 0) return null;
        const blocking = e.payload?.blocking === true;
        // A question that does not block has completed its turn: as long as the agent
        // works, what we see on the screen is the NEXT turn.
        if (working && !blocking) return null;
        return { eventId: e.id, questions, blocking };
      }
    }
    return null;
  }, [liveRun, working, steerable, pendingMessages, liveEvents]);
  // “Create a pull request” makes sense when the session is resumeable AND no
  // PR does not yet exist: the changes bar then shows the button (if work
  // was pushed). Otherwise the header already says “open PR”.
  // A REVIEW session has nothing to deliver: it does not write to the repository
  // and does not have `create_pr`. Offering the button would send the agent a
  // consigne qu'il ne peut que refuser.
  const canCreatePr =
    steerable && liveRun?.pr_number == null && liveRun?.pull_request_id == null;
  // Files in “files changed” blocks open the session diff view
  // IN the conversation (scratchpad note: see the diff while the agent
  // modifies, without waiting for the PR) — the Sheet shows the work pushed, PR or not.
  //
  // STABLE (useCallback): this callback goes down to the thread blocks, which are
  // memorized. Recreated with each render, it would wake them all with each push of the
  // direct — four times per second while the agent writes.
  const openDiffSheet = useCallback(() => {
    setDiffFocus(null);
    setDiffOpen(true);
  }, []);
  const openDiffAt = useCallback((path: string) => {
    setDiffFocus(path);
    setDiffOpen(true);
  }, []);
  const openDiff = liveRun ? openDiffAt : undefined;

  // Changing runs empties the optimistic bubbles: they belong to the
  // conversation we leave, not the one we open. `launchText` leaves with:
  // the launched session now exists and its prompt comes from the server.
  useEffect(() => {
    setPendingMessages([]);
    setLaunchText(null);
    setLaunchLocalExec(false);
    setRequestingPr(false);
    // The requested shutdown applies to the session you are leaving, not the one you are opening.
    setStopping(false);
    // The diff view belongs to the session we are leaving.
    setDiffOpen(false);
  }, [liveRun?.id]);

  // The server caught the stop — or the round just ended on its own
  // after the click: the optimistic state has nothing more to cover. He must leave,
  // otherwise the NEXT round (relaunched by a message) would be displayed at rest.
  useEffect(() => {
    if (!serverWorking) setStopping(false);
  }, [serverWorking]);

  // The PR request has “taken” as soon as the agent leaves (working) or the PR exists:
  // we reactivate the button (it will disappear by itself via `canCreatePr`).
  useEffect(() => {
    if (working || liveRun?.pr_number != null) setRequestingPr(false);
  }, [working, liveRun?.pr_number]);

  // A round that ends emits its LAST events (summary + `files_changed`) just
  // before passing `completed`: polling at 2 s stops as soon as the status is
  // more “works” and can therefore miss them. We refetch once in passing
  // work → rest so that the settled file block and the PR button arrive without
  // wait for reassembly. Same reason for the session delay: the final push of the
  // turn arrives at this time, an open diff view should reflect it without re-poll.
  //
  // On the SERVER, and not on what the interface displays: an optimistic shutdown
  // causes `working` to change to false seconds before the turn returns its
  // latest events, and it is precisely them that we are looking for here.
  const wasWorkingRef = useRef(serverWorking);
  useEffect(() => {
    const runId = liveRun?.id;
    if (wasWorkingRef.current && !serverWorking && runId) {
      void queryClient.invalidateQueries({ queryKey: ["agent-run-events", runId] });
      void queryClient.invalidateQueries({ queryKey: agentRunDiffQueryKey(runId) });
    }
    wasWorkingRef.current = serverWorking;
  }, [serverWorking, liveRun?.id, queryClient]);

  // Heartbeat as long as the component is active on a session: keeps the sandbox
  // alive while reading/writing (the reaper only cuts inactive runs).
  useEffect(() => {
    if (!active || !liveRun) return;
    const id = liveRun.id;
    void heartbeatAgentRunApi(id);
    const timer = setInterval(() => void heartbeatAgentRunApi(id), 45_000);
    return () => clearInterval(timer);
  }, [active, liveRun?.id]);

  // Model selection (compose phase).
  const {
    provider,
    defaultModel: providerDefaultModel,
    cloudExecutionConfigured,
    executionBackend,
  } = useAgentModelsQuery();
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  // BASE branch (compose phase, new line): "" = the defect of the deposit.
  // Like the model, the choice is only made at launch – frozen afterwards.
  const [baseBranch, setBaseBranch] = useState("");
  // Level of reasoning (MIN-122), also frozen at launch. `null` = not
  // still touched → we follow the personal fault, which can occur after assembly.
  const [reasoningOverride, setReasoningOverride] = useState<ReasoningLevel | null>(null);
  // The bearings of the MODEL which will rotate (override chosen, otherwise personal default,
  // otherwise default of the provider): what the list selector depends on it, and the
  // displayed level is lowered to what it accepts.
  const reasoningLevels = useReasoningLevelsFor(model || defaultModel || providerDefaultModel);
  const reasoningLevel = nearestReasoningLevel(
    reasoningOverride ?? defaultReasoningLevel,
    reasoningLevels,
  );
  const [launching, setLaunching] = useState(false);
  // Generic and local endpoints have no reliable fault: the id of the
  // model is a decision of their owner, never a cloud fallback.
  const localEndpoint = isLocalAgentProvider(provider);
  const modelRequired = (provider === "generic" || localEndpoint) && !defaultModel && !model;

  // WHERE THE CONVERSATION TURNS (MIN-359), frozen at launch like its three
  // neighbors. The chip only exists in the desktop app AND when a folder is
  // attached to this project on THIS machine: elsewhere, there is no choice
  // offer, and a grayed chip would promise a toggle that does not exist.
  const localRepo = useLocalRepo(projectId);

  const [environment, setEnvironment] = useState<AgentEnvironment>("cloud");
  // The folder has disappeared under the attachment (moved, unmounted disk, deposit
  // re-linked): we fall back on the cloud rather than launching towards a dead path.
  useEffect(() => {
    setEnvironment(localEndpoint || localRepo.ready ? "local" : "cloud");
  }, [localEndpoint, localRepo.ready]);

  const launch = async (
    message: string,
    attachments: ResourceInput[] = [],
    mentions: AssistantMention[] = [],
  ) => {
    // The compose phase only exists for an ISSUE anchor (that of sessions
    // without a ticket lives in SessionCompose, before any run): no exit, nothing
    // to launch here.
    if (launching || !issueId) return;
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    const prompt = message.trim();
    const localExec = environment !== "cloud" && localRepo.ready;
    if (!localExec && !cloudExecutionConfigured) {
      toast.error(t("errorExecutionBackendUnavailable"));
      return;
    }
    const localWorktree = localExec && environment === "worktree";
    setLaunching(true);
    // OPTIMISTIC display of the 1st message, as for a follow-up: the POST continues
    // the pre-checks (issue, deposit, quota, model resolution) before submitting the
    // session, and during this time the message does not exist anywhere — neither in the
    // compose (emptied on sending), nor in the thread (no session to display).
    if (prompt) setLaunchText(prompt);
    setLaunchMentions(mentions);
    setLaunchLocalExec(localExec);
    try {
      const { run: started } = await launchAgentRunApi(issueId, {
        prompt: prompt || undefined,
        model: model || undefined,
        // The server ignores it if the lineage already inherits a branch (the picker
        // is then locked — belt and shoulder straps on the racing side).
        baseBranch: baseBranch || undefined,
        reasoningLevel,
        intent: composeIntent,
        mentions,
        attachments,
        // `ready` and not just the state of the chip: between choice and sending,
        // the file may have disappeared.
        localExec,
        localWorktree,
      });
      // The new session becomes the open session → immediate live switch. Her
      // `prompt` carries the same text: the thread displays the SAME bubble, without interruption.
      setLaunched(started);
      setSelectedId(started.id);
      setComposing(false);
      onLaunched?.(started);
      await refreshRuns();
    } catch (err) {
      // Refused (quota, no deposit, a session is already running...): the session does not exist
      // not → we remove the bubble rather than suggesting the launch.
      setLaunchText(null);
      setLaunchMentions([]);
      setLaunchLocalExec(false);
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  // Message at rest: continues the conversation (new turn in the same context).
  const steer = async (
    message: string,
    mentions: AssistantMention[] = [],
    attachments: ResourceInput[] = [],
  ) => {
    if (!liveRun) return;
    const text = message.trim();
    if (!text) return;
    // OPTIMISTIC display: the bubble would only return from the server when the
    // loop (including sandbox wake-up, several seconds) — until then the user
    // would have the impression of having hit a void. The feed removes it as soon as its
    // echo arrives. If this fails, we remove it ourselves (the message does not exist).
    setPendingMessages((p) => [...p, { text, mentions }]);
    try {
      await steerAgentRunApi(liveRun.id, text, mentions, attachments);
      await Promise.all([
        refreshRuns(),
        queryClient.invalidateQueries({ queryKey: ["agent-run-events", liveRun.id] }),
      ]);
    } catch (err) {
      // Refused (PR merged, run exceeded, race with a more recent run started
      // in another tab…): the message does not exist anywhere → we remove its bubble
      // rather than letting people believe he's gone.
      setPendingMessages((p) => {
        const i = p.findIndex((message) => message.text === text);
        return i === -1 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
      toast.error(agentErrorMessage(err));
    }
  };

  // Interrupts the current response of the model; the session returns to rest.
  //
  // The interface stops ON CLICK (`stopping`), without waiting for the server to
  // took the flag: the button becomes “send” again, the turn folds back to its
  // duration. It's no lie about what's happening on the machine side — the trick
  // will indeed stop, and if he concludes in the meantime his summary takes the place
  // of all that — it's an acknowledgment of receipt, the only thing that was missing.
  const interrupt = async () => {
    if (!liveRun) return;
    setStopping(true);
    try {
      await interruptAgentRunApi(liveRun.id);
      await refreshRuns();
    } catch (err) {
      // Refused (network, session disappeared): the round continues → we return control to the
      // button rather than letting the interface pretend it has stopped.
      setStopping(false);
      toast.error((err as Error).message);
    }
  };

  // Sending from the live composer. If the agent is WORKING: we put the message first
  // in line THEN we interrupt → the current round stops and resumes by processing
  // this message as priority (steering). At rest: simple restart.
  //
  // EXCEPT WHEN THE TURN IS WAITING FOR A RESPONSE (MIN-364, D7): the message is then not
  // not from steering, it UNDOES the tool `question` on which the round is
  // suspended. The harness recognizes it anyway (`pendingQuestion`, cf.
  // supervisor.ts) and consumes the shutdown flag without setting it; don't send it
  // at all simply avoid asking for a stop to what you have just unlocked.
  const sendLive = async (
    message: string,
    attachments: ResourceInput[] = [],
    mentions: AssistantMention[] = [],
    opts: { answersBlockingQuestion?: boolean } = {},
  ) => {
    const text = message.trim();
    if (!text) return;
    await steer(text, mentions, attachments);
    if (opts.answersBlockingQuestion) return;
    // On what the SERVER does, not on what the interface shows: a shutdown
    // already requested but not yet taken, let the trick run, and the message
    // must still cut it.
    if (serverWorking) await interrupt();
  };

  // “Create a pull request” (note MIN-46): we do NOT open the PR ourselves — we
  // INJECTS a message requesting it from the agent, who opens it via its tool `create_pr`
  // and then iterates on it as on any instruction. The button does not appear
  // qu'au repos sans PR (cf. `canCreatePr`), donc un simple steer suffit.
  const createPr = async () => {
    if (!liveRun || requestingPr) return;
    setRequestingPr(true);
    await steer(t("createPrPrompt"));
  };

  // Run not found / not yet loaded → spinner, never composed: the run
  // necessarily exists (a conversation is born from a launch), it is not yet
  // arrived. Applies to a notebook run as well as a run DESIGNATED by the caller
  // (`initialRunId`) — without this case, the conversation that we have just opened from the
  // list flashed in blank dial while the query responded.
  const phase: "live" | "loading" | "compose" = liveRun
    ? "live"
    : loading || noteRunId || (selectedId && !composing)
      ? "loading"
      : "compose";

  /**
   * Action of the session, to the left of those of the host (the link to the pull
   * request). The file summary is now in the pill above the
   * compose, so that the header does not change size when the diff changes.
   */
  const sessionActions =
    liveRun && canCreatePr && !working ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={requestingPr}
        onClick={() => void createPr()}
      >
        <GitPullRequest className="size-3.5" />
        {t("createPullRequest")}
      </Button>
    ) : null;

  // The live reading has its place in the pill during the tour. Once the turn
  // finished, the final block `files_changed` appears in the thread: let's not keep
  // a second pill which would only contain the same summary.
  const changedFileCount = working ? liveHeaderFiles.length : 0;

  return (
    <MentionLinksProvider value={links}>
      <div className="flex h-full flex-col overflow-hidden">
      {/* Header: left block provided by the host (default: session template in
          live / targeted issue in composite) + actions on the right. Without border: the wire
          breathes all the way to the top, and the header doesn't read as a separate bar.
          Bottom deliberately tighter than the top (`pb-2.5`): the space under the
          title is already given by the `pt-3` of the sessions bar just below. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2.5">
        {headerTitle ??
          (liveRun ? (
            <ModelBadge model={liveRun.model} className="min-w-0 shrink" />
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <NumoIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {t("sectionTitle")}
                <span className="text-muted-foreground">
                  {" · "}
                  {issueIdentifier}
                </span>
              </span>
            </span>
          ))}

        {sessionActions || headerActions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {sessionActions}
            {headerActions}
          </div>
        ) : null}
      </div>

      {/* Feed: event stream (live), in-flight launch, spinner or intro. */}
      <div className="min-h-0 flex-1">
        {phase === "live" && liveRun ? (
          <AgentEventFeed
            runId={liveRun.id}
            status={liveRun.status}
            stopping={stopping}
            prompt={liveRun.prompt}
            promptMentions={liveRun.prompt_mentions}
            pendingUserMessages={pendingMessages}
            onOpenFile={openDiff}
            onOpenDiff={openDiffSheet}
            liveDiffFiles={liveDiffFiles}
            hiddenQuestionEventId={activeQuestion?.eventId}
            localExec={liveRun.local_exec === true}
            className="h-full py-4"
          />
        ) : launchText ? (
          // Session being created: no session to query yet, but
          // the SAME thread, which only displays the bubble of the 1st message + “works”.
          // Reusing the feed (rather than an ad hoc bubble) ensures that when
          // the session takes over, the bubble does not move a pixel.
          <AgentEventFeed
            runId={null}
            status="queued"
            pendingUserMessages={[{ text: launchText, mentions: launchMentions }]}
            localExec={launchLocalExec}
            className="h-full py-4"
          />
        ) : phase === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
              <NumoIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t("dialogDescription")}
            </p>
          </div>
        )}
      </div>

      {/* Compose: steering/interruption (live) or pre-written launch (compose).
          Terminaled to the same max width as the wire and centered. On the Agents PAGE it
          sits just above the mobile navigation bar, so in the
          gradient that it projects: `dock-above-nav` outputs it (see globals.css).
          In the modal, the class costs nothing — the Sheet is its own
          contexte d'empilement. */}
      {phase !== "loading" && (
        <div className="dock-above-nav shrink-0">
          <div className="mx-auto w-full max-w-[800px]">
          {/* The living summary remains on a single line and at the width of its
              content: plan, files and subagents share a pill instead
              to push the dial to each additional detail. */}
          {liveRun ? (
            <AgentActivityPill
              planSteps={planSteps}
              fileCount={changedFileCount}
              additions={sessionTotals.additions}
              deletions={sessionTotals.deletions}
              subagents={subagents}
              onOpenDiff={openDiffSheet}
            />
          ) : null}
          {/* Active question: the card takes the PLACE of the composer (pattern
              Claude Code/Codex). The ChatInput remains MOUNTED, hidden in CSS — the
              The user's draft survives and reappears after the response. */}
          {liveRun && activeQuestion ? (
            <div className="pb-3">
              <AskUserCard
                key={activeQuestion.eventId}
                questions={activeQuestion.questions}
                onAnswer={(text) =>
                  void sendLive(text, [], [], {
                    answersBlockingQuestion: activeQuestion.blocking,
                  })
                }
                onSkip={() =>
                  void sendLive(tToolCall("skippedQuestions"), [], [], {
                    answersBlockingQuestion: activeQuestion.blocking,
                  })
                }
              />
            </div>
          ) : null}
          {liveRun ? (
            <div className={cn(activeQuestion && "hidden")}>
              <ChatInput
              key={liveRun.id}
                onSend={(message, attachments, mentions) =>
                  void sendLive(message, attachments, mentions)
                }
              onAbort={() => void interrupt()}
              isStreaming={working}
              sendWhileStreaming
                beam={working}
                disabled={!steerable}
                mentionables={mentionables}
                onMentionQuery={onMentionQuery}
              placeholder={
                steerable
                  ? working
                    ? t("livePlaceholder")
                    : t("restPlaceholder")
                  : delivered
                    ? // Work delivered: we do not reopen a PR cycle on it.
                      t("mergedRunPlaceholder")
                    : // Past run: consultation only (a more recent run has
                      // took over the branch). Otherwise: run `failed`, nothing to restart.
                      isLatest
                      ? t("endedPlaceholder")
                      : t("pastRunPlaceholder")
              }
              leadingControls={
                <>
                  {/* Fixed model for the session: locked picker + tooltip. */}
                  <ModelCombobox
                    variant="compact"
                    value={liveRun.model ?? ""}
                    onChange={() => {}}
                    defaultLabel={t("modelDefault")}
                    defaultModelId={liveRun.model}
                    placeholder={t("modelSearchPlaceholder")}
                    emptyLabel={t("modelSearchEmpty")}
                    loadingLabel={t("modelSearchLoading")}
                    freeTextLabel={(q) => t("modelUseCustom", { model: q })}
                    disabled
                    disabledTooltip={t("modelLocked")}
                  />
                  {/* Level of reasoning, frozen at launch like the model. */}
                  <ReasoningCombobox
                    value={liveRun.reasoning_level ?? "off"}
                    onChange={() => {}}
                    disabled
                    disabledTooltip={t("reasoningLocked")}
                  />
                </>
              }
              />
            </div>
          ) : (
            <ChatInput
              key="compose"
              onSend={(message, attachments, mentions) =>
                void launch(message, attachments, mentions)
              }
              mentionables={mentionables}
              onMentionQuery={onMentionQuery}
              disabled={launching}
              sendDisabled={environment === "cloud" && !cloudExecutionConfigured}
              sendDisabledTooltip={t("errorExecutionBackendUnavailable")}
              initialValue={initialComposeText}
              placeholder={t("composePlaceholder")}
              contextSlot={
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  <BranchCombobox
                    issueId={issueId}
                    value={baseBranch}
                    onChange={setBaseBranch}
                    defaultLabel={t("branchDefault")}
                    defaultHint={t("branchDefaultHint")}
                    placeholder={t("branchSearchPlaceholder")}
                    emptyLabel={t("branchSearchEmpty")}
                    loadingLabel={t("branchSearchLoading")}
                    disabled={launching}
                    localBranches={environment !== "cloud" ? localRepo.branches : undefined}
                    localLabel={t("branchLocalGroup")}
                    cloudLabel={t("branchCloudGroup")}
                    bare
                  />
                  {localRepo.linked ? (
                    <EnvironmentCombobox
                      value={environment}
                      onChange={setEnvironment}
                      localAvailable={localRepo.available}
                      cloudAvailable={!localEndpoint && cloudExecutionConfigured}
                      executionBackend={executionBackend}
                      folder={localRepo.state?.status === "ready" ? localRepo.state.folder : null}
                      needsAttach={localRepo.state?.status !== "ready"}
                      onAttach={() => {
                        void localRepo.attach().then((next) => {
                          if (next?.status === "ready") setEnvironment("local");
                          else if (next && next.status === "invalid") {
                            toast.error(t(LOCAL_REPO_ERROR_KEYS[next.reason]));
                          }
                        });
                      }}
                      disabled={launching || localRepo.busy}
                      bare
                    />
                  ) : null}
                </div>
              }
              contextPlacement="above"
              leadingControls={
                <>
                  <ModelCombobox
                    variant="compact"
                    value={model}
                    onChange={setModel}
                    defaultLabel={t("modelDefault")}
                    defaultModelId={defaultModel ?? providerDefaultModel}
                    placeholder={t("modelSearchPlaceholder")}
                    emptyLabel={t("modelSearchEmpty")}
                    loadingLabel={t("modelSearchLoading")}
                    freeTextLabel={(q) => t("modelUseCustom", { model: q })}
                    disabled={launching}
                  />
                  <ReasoningCombobox
                    value={reasoningLevel}
                    onChange={setReasoningOverride}
                    disabled={launching}
                    levels={reasoningLevels}
                  />
                </>
              }
            />
          )}
          </div>
        </div>
      )}

      {/* Session diff view: Sheet over the conversation, powered by
          the live diff of the run (PR or branch comparison). Rise as soon as a
          session is open — the query only starts when opened. */}
      {liveRun ? (
        <AgentDiffSheet
          runId={liveRun.id}
          open={diffOpen}
          onOpenChange={setDiffOpen}
          focusPath={diffFocus}
          // The real status: it is this which sets the pace for the refresh of the diff, and
          // the lathe continues to push during the seconds following the requested stop.
          working={serverWorking}
          baseBranch={liveRun.base_branch}
          branchName={liveRun.branch_name}
          local={useLocalDiff}
          localFiles={localDiff.files}
          localTruncated={localDiff.truncated}
        />
      ) : null}
      </div>
    </MentionLinksProvider>
  );
}
