"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  History,
  Lightbulb,
  ListTodo,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
} from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import {
  ChatInput,
  type ChatInputContextAttachments,
  type ChatInputHandle,
} from "@/components/assistant/chat-input";
import { ConversationSettings } from "@/components/assistant/conversation-settings";
import {
  ChatMessage,
  StreamingMessage,
} from "@/components/assistant/chat-message";
import { AskUserCard } from "@/components/assistant/ask-user-card";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import { WorkEvents } from "@/components/assistant/work-events";
import { workEventsRevealKey, type WorkEvent } from "@/lib/work-event-groups";
import { liveSecretRevealKey } from "@/components/assistant/secret-callout";
import { parseAskUserQuestions, type AskUserQuestion } from "@/lib/ask-user";
import {
  buildAssistantBlocks,
  copyableMessageIds,
} from "@/lib/assistant-turns";
import { ConversationList } from "@/components/assistant/conversation-list";
import { AssistantContextBar } from "@/components/assistant/assistant-context-bar";
import {
  applyContextSelection,
  contextChips,
  withPinnedContext,
} from "@/lib/assistant-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import { useRepositorySkills } from "@/lib/use-repository-skills";
import { MentionLinksProvider } from "@/components/mention-links";
import { useSlashCommands } from "@/components/assistant/slash-menu";
import { useProjects } from "@/lib/projects-context";
import type {
  AssistantChatRequest,
  AssistantCommandId,
  AssistantMention,
  AssistantMessage,
  AssistantPageContext,
  AssistantPinnedContext,
  AssistantSkillSelection,
} from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { ReasoningBlock } from "@/components/agent/reasoning-block";
import { assistantMessageReasoning } from "@/lib/assistant-reasoning";

const STARTERS = [
  {
    key: "s1",
    icon: Search,
    iconClassName: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "s2",
    icon: Plus,
    iconClassName: "text-violet-600 dark:text-violet-400",
  },
  {
    key: "s3",
    icon: ListTodo,
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "s4",
    icon: Lightbulb,
    iconClassName: "text-rose-600 dark:text-rose-400",
  },
] as const;

export type AssistantDisplayMode = "compact" | "expanded";

export interface AssistantShellHandle {
  /** Send a message. `projectId` null = global mode. The remaining options
   * apply only to this send: page context for contextual openings, plus the
   * mentions, command, and attachments from a composer outside this shell
   * (such as home). An absent `pageContext` uses the shell context. */
  sendMessage: (
    projectId: string | null,
    message: string,
    options?: {
      pageContext?: AssistantPageContext | null;
      mentions?: AssistantMention[];
      command?: AssistantCommandId;
      attachments?: ResourceInput[];
      skills?: AssistantSkillSelection[];
    },
  ) => void;
  /** Pre-fill the composer without sending. */
  fill: (text: string) => void;
}

export interface AssistantShellProps {
  /** null = global assistant (no project context). */
  projectId: string | null;
  /** Optional mobile-only secondary label next to the sidebar toggle. */
  mobileSubtitle?: string;
  /** Tighten the layout for narrow surfaces like the global FAB panel. */
  compact?: boolean;
  /** Current panel display mode. In "expanded" the centered conversation
   *  column widens (max-w-4xl) and the toolbar toggle shows the collapse icon. */
  displayMode?: AssistantDisplayMode;
  /** Toggles compact ⇄ expanded from the compact-header toolbar (desktop). */
  onToggleDisplayMode?: () => void;
  /** When provided, renders a close (X) button in the compact header. */
  onClose?: () => void;
  /** What the user is currently viewing — rides on every message sent from
   *  this shell so Numo can resolve "ce ticket". */
  pageContext?: AssistantPageContext | null;
}

export const AssistantShell = forwardRef<
  AssistantShellHandle,
  AssistantShellProps
>(function AssistantShell(
  {
    projectId,
    mobileSubtitle,
    compact = false,
    displayMode = "compact",
    onToggleDisplayMode,
    onClose,
    pageContext = null,
  },
  ref
) {
  const isExpanded = displayMode === "expanded";
  // Expanded mode keeps the conversation centered (mx-auto) but widens the
  // reading column to use more of the larger surface.
  const convoMaxW = isExpanded ? "max-w-4xl" : "max-w-3xl";
  const t = useTranslations("Assistant");
  const tc = useTranslations("Common");
  const tToolCall = useTranslations("ToolCall");
  const tSeed = useTranslations("Seed");
  const aiAvailability = useAiSurfaceAvailability("assistant");

  // The conversation lives ABOVE the panel (AssistantChatProvider): it
  // survives the closing of the Sheet, which dismantles this shell. Here, we don't do
  // than return it.
  const { state, sendMessage, loadConversation, reset, retry, abort, restoring, pinned, setPinned } =
    useAssistantChatContext();
  const chatInputRef = useRef<ChatInputHandle>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Portal target for the history popover. When the shell lives inside a modal
  // Sheet/Dialog, Radix's `react-remove-scroll` blocks wheel/touch scrolling on
  // anything portaled to <body> (outside its allowed subtree). Resolving the
  // enclosing sheet-content node and portaling the popover into it keeps the
  // list scrollable. Falls back to <body> when there's no sheet ancestor.
  const [historyContainer, setHistoryContainer] = useState<HTMLElement | null>(
    null
  );
  const historyAnchorRef = useCallback((node: HTMLDivElement | null) => {
    setHistoryContainer(
      node
        ? (node.closest('[data-slot="sheet-content"]') as HTMLElement | null)
        : null
    );
  }, []);

  // ── Context: what Numo has in front of his eyes ────────────────────────
  // The context of the page (ambient) is completed by the SCOPE (the project
  // current, which is worth context in itself) and by what the user pins
  // by hand from the @ button. Extinguished pills are not removed from
  // the display: they only go out of the sent context — this is
  // `applyContextSelection` which sorts it once when sending.
  const { projects } = useProjects();
  const [disabledKeys, setDisabledKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const fullContext = useMemo(
    () => withPinnedContext(pageContext, { scopeProjectId: projectId, pinned }),
    [pageContext, projectId, pinned],
  );

  const resolveProject = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects],
  );

  const chips = useMemo(
    () => contextChips(fullContext, { t, project: resolveProject }),
    [fullContext, t, resolveProject],
  );

  // New conversation → we start from the context of the page, without the
  // pins nor the extinctions of the previous round.
  const resetContextSelection = useCallback(() => {
    setPinned([]);
    setDisabledKeys(new Set());
  }, [setPinned]);

  const toggleChip = useCallback((key: string) => {
    setDisabledKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const removePinned = useCallback((key: string) => {
    setPinned((prev) =>
      prev.filter((item) => `pinned:${item.kind}:${item.id}` !== key),
    );
  }, [setPinned]);

  const addPinned = useCallback((item: AssistantPinnedContext) => {
    setPinned((prev) =>
      prev.some((p) => p.kind === item.kind && p.id === item.id)
        ? prev
        : [...prev, item],
    );
  }, [setPinned]);

  // “@” mentions in the text: the list only loads at the first
  // hits with an “@” (and then remains cached).
  const messageReferences = useMemo(() => state.messages.flatMap((message) => [
    ...(Array.isArray(message.metadata?.mentions) ? message.metadata.mentions as AssistantMention[] : []),
    ...(message.context?.pinned ?? []).map(({ kind, ...item }) => ({ ...item, type: kind })),
  ]), [state.messages]);
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId, messageReferences);

  // Read by the send handlers without stale closures. The host may set the
  // context the same tick it dispatches a one-shot send, so the imperative
  // sendMessage also takes an explicit override to avoid that race.
  // The EFFECTIVE context (reach + pins − extinguished pills): it is he who
  // leaves with the message, and he stays on the bubble.
  const effectiveContext = useMemo(
    () => applyContextSelection(fullContext, disabledKeys),
    [fullContext, disabledKeys],
  );
  const effectiveContextRef = useRef(effectiveContext);
  useEffect(() => {
    effectiveContextRef.current = effectiveContext;
  }, [effectiveContext]);

  // Expose imperative controls to the host page (URL-param driven flows).
  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (pid, msg, opts) =>
        !aiAvailability.loading && !aiAvailability.available
          ? undefined
          : sendMessage(pid, msg, {
              pageContext:
                opts?.pageContext !== undefined
                  ? opts.pageContext
                  : effectiveContextRef.current,
              ...(opts?.mentions?.length ? { mentions: opts.mentions } : {}),
              ...(opts?.command ? { command: opts.command } : {}),
              ...(opts?.attachments?.length
                ? { attachments: opts.attachments }
                : {}),
              ...(opts?.skills?.length ? { skills: opts.skills } : {}),
            }),
      fill: (text) => chatInputRef.current?.fill(text),
    }),
    [aiAvailability.available, aiAvailability.loading, sendMessage]
  );

  const handleSend = useCallback(
    (
      message: string,
      attachments: ResourceInput[] = [],
      mentions: AssistantMention[] = [],
      command?: AssistantCommandId,
      skills: AssistantSkillSelection[] = [],
      workerInput?: AssistantChatRequest["workerInput"],
    ) => {
      if (!aiAvailability.loading && !aiAvailability.available) return;
      sendMessage(effectiveContextRef.current?.projectId ?? null, message, {
        pageContext: effectiveContextRef.current,
        attachments,
        mentions,
        command,
        skills,
        workerInput,
      });
    },
    [aiAvailability.available, aiAvailability.loading, sendMessage]
  );

  const slashCommands = useSlashCommands();
  const repositorySkills = useRepositorySkills(
    projectId,
    "cloud",
    state.conversationId,
  );

  // Response sent from an ask_user question card (MIN-86): leaves as
  // a normal user message — the tool result “awaiting_user_response” is
  // already in the history, the loop resumes with the response.
  const handleAnswer = useCallback(
    (text: string, workerInput?: AssistantChatRequest["workerInput"]) => {
      if (!text.trim()) return;
      handleSend(text, [], [], undefined, [], workerInput);
    },
    [handleSend]
  );

  const handleSelectConversation = useCallback(
    (conversationId: string, conversationProjectId: string | null) => {
      loadConversation(conversationId, conversationProjectId);
    },
    [loadConversation]
  );

  const handleNewConversation = useCallback(() => {
    reset();
    resetContextSelection();
    setRefreshKey((k) => k + 1);
  }, [reset, resetContextSelection]);

  const isStreaming =
    state.status === "streaming" || state.status === "executing_tool";
  const isGeneratingServer = state.status === "generating_server";
  const isBusy = isStreaming || isGeneratingServer;
  const hasMessages = state.messages.length > 0 || isBusy;

  // Question ask_user ACTIVE: the last visible message is a message
  // assistant carrying a tool-call ask_user and Numo is at rest (he is waiting for the
  // answer). The VIVANTE card then replaces the composer (pattern Claude
  // Code/Codex); the corresponding thread bubble is hidden. The questions of
  // Past turns remain in the wire, inert.
  const activeAskUser = useMemo((): {
    messageId: string;
    questions: AskUserQuestion[];
    workerInput?: AssistantChatRequest["workerInput"];
  } | null => {
    if (isBusy) return null;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === "tool" || m.role === "system") continue;
      if (m.role !== "assistant" || !m.tool_calls?.length) return null;
      const call = m.tool_calls.find((c) => c.function.name === "ask_user");
      if (!call) return null;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Invalid LLM args → no card.
      }
      const questions = parseAskUserQuestions(args);
      const rawWorkerInput = args._worker_input as Record<string, unknown> | undefined;
      const workerInput = rawWorkerInput
        && typeof rawWorkerInput.parent_turn_id === "string"
        && typeof rawWorkerInput.run_id === "string"
        && typeof rawWorkerInput.question_id === "string"
        ? {
            parentTurnId: rawWorkerInput.parent_turn_id,
            runId: rawWorkerInput.run_id,
            questionId: rawWorkerInput.question_id,
          }
        : undefined;
      if (workerInput && state.pendingWorkerInput === null) return null;
      if (workerInput && state.pendingWorkerInput && (
        state.pendingWorkerInput.parentTurnId !== workerInput.parentTurnId
        || state.pendingWorkerInput.runId !== workerInput.runId
        || state.pendingWorkerInput.questionId !== workerInput.questionId
      )) return null;
      return questions.length > 0
        ? { messageId: m.id, questions, ...(workerInput ? { workerInput } : {}) }
        : null;
    }
    return null;
  }, [state.messages, state.pendingWorkerInput, isBusy]);

  // Skip questions: Numo receives an explicit user message and resumes.
  const handleSkipQuestions = useCallback((workerInput?: AssistantChatRequest["workerInput"]) => {
    handleSend(tToolCall("skippedQuestions"), [], [], undefined, [], workerInput);
  }, [handleSend, tToolCall]);

  // Active seed proposal (MIN-173): use the same rule as an open question.
  // The last visible message contains `propose_backlog` while Numo is idle
  // because the tool yielded. Once another message follows, the proposal is
  // historical and the review card is no longer interactive.
  const activeSeedMessageId = useMemo((): string | null => {
    if (isBusy) return null;
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m.role === "tool" || m.role === "system") continue;
      if (m.role !== "assistant" || !m.tool_calls?.length) return null;
      return m.tool_calls.some((c) => c.function.name === "propose_backlog")
        ? m.id
        : null;
    }
    return null;
  }, [state.messages, isBusy]);

  // The tickets have just been written: Numo learns of this through a message from
  // the user — it’s HIS gesture — and the conversation resumes there.
  // This is also what turns off the card, including when reloading.
  const handleSeedCreated = useCallback(
    (created: number) => {
      handleSend(tSeed("createdReply", { count: created }));
    },
    [handleSend, tSeed]
  );

  // Answers to ask_user questions: the user bubble that follows a carrying message
  // of an ask_user is their answer — it is NOT displayed as a bubble (the flow of
  // reading remains clean) but in the details of the ask_user line of the thread.
  const askUserReplies = useMemo(() => {
    const byMessageId = new Map<string, string>();
    const hiddenBubbleIds = new Set<string>();
    let prevVisible: (typeof state.messages)[number] | null = null;
    for (const m of state.messages) {
      if (m.role === "tool" || m.role === "system") continue;
      if (
        m.role === "user" &&
        m.content &&
        prevVisible?.role === "assistant" &&
        prevVisible.tool_calls?.some((c) => c.function.name === "ask_user")
      ) {
        byMessageId.set(prevVisible.id, m.content);
        hiddenBubbleIds.add(m.id);
      }
      prevVisible = m;
    }
    return { byMessageId, hiddenBubbleIds };
  }, [state.messages]);

  // Reading thread in TURN, on parity with the code agent thread: everything that
  // Numo did before responding (intermediate narration, calls for tools)
  // folds into an accordion “Worked since X” / “Worked for X”, and
  // only the answer remains visible below — we follow the work, then we read the
  // final message, instead of receiving the turn of a block.
  // A pending ask_user keeps the round OPEN: the pause is part of the same
  // turn (the question card replaces the composer below), so no second
  // accordion ever appears and the key stays stable across the answer.
  const blocks = useMemo(
    () =>
      buildAssistantBlocks(state.messages, {
        active: isBusy || Boolean(activeAskUser),
        pendingWork:
          state.activeToolCalls.length > 0 ||
          state.streamingContent.length > 0 ||
          Boolean(state.streamingReasoning),
      }),
    [
      state.messages,
      isBusy,
      activeAskUser,
      state.activeToolCalls.length,
      state.streamingContent.length,
      state.streamingReasoning,
    ]
  );

  // The thread only resets at the bottom upon a GESTURE from the user: open a
  // conversation, or send a message. While Numo writes, he no longer moves —
  // that's all `<Conversation>` can do, and its back button at the bottom
  // stay there to catch the end whenever you want it.
  const userMessageCount = useMemo(
    () => state.messages.filter((m) => m.role === "user").length,
    [state.messages],
  );
  const scrollAnchor = `${state.conversationId ?? "new"}:${userMessageCount}`;

  // “Copy” button: only on the ANSWER of the round — the one that remains
  // alone under the accordion folded into “Worked for X”. What is folded
  // in is middle work, not a takeaway answer.
  const copyButtonIds = useMemo(() => copyableMessageIds(blocks), [blocks]);

  // Is the active lap already showing work? Its timed header then reads
  // the signal “Numo is working” and the reflection indicator would be duplicated.
  const lastBlock = blocks[blocks.length - 1];
  const activeTurnHasWork =
    lastBlock?.kind === "turn" &&
    lastBlock.active &&
    (lastBlock.work.length > 0 ||
      state.activeToolCalls.length > 0 ||
      Boolean(state.streamingReasoning));

  const allToolCallsComplete =
    state.activeToolCalls.length > 0 &&
    state.activeToolCalls.every((tc) => tc.status === "complete");
  const showThinking =
    isStreaming &&
    !state.streamingContent &&
    !state.streamingReasoning &&
    (state.activeToolCalls.length === 0 || allToolCallsComplete) &&
    !activeTurnHasWork;

  const renderMessage = (msg: AssistantMessage) =>
    // Answer to an ask_user question: it is not displayed in a bubble, but in
    // the details of the question line (askUserReplies).
    askUserReplies.hiddenBubbleIds.has(msg.id) ? null : (
      <ChatMessage
        key={msg.id}
        message={msg}
        toolCallResults={state.toolCallResults}
        askUserHidden={msg.id === activeAskUser?.messageId}
        askUserAnswer={askUserReplies.byMessageId.get(msg.id)}
        seedLive={msg.id === activeSeedMessageId}
        onSeedCreated={handleSeedCreated}
        showCopyButton={copyButtonIds.has(msg.id)}
      />
    );

  const renderReasoning = (
    id: string,
    reasoning: ReturnType<typeof assistantMessageReasoning>,
  ) =>
    reasoning ? (
      <ReasoningBlock
        key={id}
        active={false}
        durationMs={reasoning.durationMs}
        text={reasoning.text}
      />
    ) : null;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ConversationList
          activeConversationId={state.conversationId}
          onSelect={(id, convProjectId) => {
            handleSelectConversation(id, convProjectId);
            setMobileSidebarOpen(false);
          }}
          onNew={() => {
            handleNewConversation();
            setMobileSidebarOpen(false);
          }}
          refreshKey={refreshKey}
        />
      </div>
    </div>
  );

  // Compact-mode header: no permanent sidebar; conversations live in a
  // Popover. The new-conversation and close buttons are grouped on the right.
  const compactHeader = compact ? (
    <div
      ref={historyAnchorRef}
      className="flex shrink-0 items-center gap-1 px-3 py-2.5"
    >
      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("conversations")}
              >
                <History className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t("conversations")}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={6}
          container={historyContainer}
          className="flex max-h-[360px] w-72 flex-col gap-0 overflow-y-auto p-1.5"
        >
          <ConversationList
            activeConversationId={state.conversationId}
            onSelect={(id, convProjectId) => {
              handleSelectConversation(id, convProjectId);
              setHistoryOpen(false);
            }}
            onNew={() => {
              handleNewConversation();
              setHistoryOpen(false);
            }}
            refreshKey={refreshKey}
            hideNewButton
          />
        </PopoverContent>
      </Popover>

      {/* Compact ⇄ expanded toggle — desktop only (mobile is full-bleed). */}
      {onToggleDisplayMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={isExpanded ? t("collapse") : t("expand")}
              onClick={onToggleDisplayMode}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {isExpanded ? t("collapse") : t("expand")}
          </TooltipContent>
        </Tooltip>
      )}

      {/* No project name here: the current project is a context like a
 other, it is displayed (and turned off) as a pill in the composer. */}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={t("newConversation")}
            onClick={handleNewConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {t("newConversation")}
        </TooltipContent>
      </Tooltip>

      {onClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={tc("close")}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} align="end">
            {tc("close")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  ) : null;

  // Same form as the page editor: the body first, its contexts then.
  // Writing the provider around the `return` would have reindented two hundred lines
  // from JSX for a direction line.
  const unavailable = !aiAvailability.loading && !aiAvailability.available;
  const shell = unavailable ? (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2"
          aria-label={tc("close")}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      ) : null}
      <NumoIcon state="idle" className="size-12 text-muted-foreground" />
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t("providerUnavailableTitle")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("providerUnavailableDescription")}
        </p>
      </div>
      <Button asChild size="sm">
        <Link href="/settings?tab=agent">{t("providerUnavailableCta")}</Link>
      </Button>
    </div>
  ) : (
    <div className="flex h-full overflow-hidden">
      {/* Permanent sidebar — only outside compact mode. */}
      {!compact && (
        <div className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
          {sidebarContent}
        </div>
      )}

      {/* Mobile sidebar sheet — only outside compact mode (compact uses Popover). */}
      {!compact && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0 md:hidden">
            <SheetTitle className="sr-only">{t("title")}</SheetTitle>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {compactHeader}

        {/* Mobile conversations toggle — non-compact only. */}
        {!compact && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <History className="h-4 w-4" />
              <span className="text-xs">{t("title")}</span>
            </Button>
            {mobileSubtitle && (
              <span className="truncate text-xs text-muted-foreground">
                {mobileSubtitle}
              </span>
            )}
          </div>
        )}

        {!hasMessages && restoring ? (
          /* Restoring the last conversation — quiet loader, no greeting flash. */
          <div className="flex flex-1 items-center justify-center">
            <NumoIcon
              state="thinking"
              className="size-8 text-muted-foreground"
            />
          </div>
        ) : (
          /* Welcome (greeting + suggestions) and conversation share THE SAME
 mounted composer: switching it from one branch to another at the first
 message would unmount it, the focus would go to <body> and the
 FocusScope of the Sheet would place it on the shell (focus halo). */
          <>
            {hasMessages ? (
              <Conversation className="min-h-0 flex-1" anchor={scrollAnchor}>
                <ConversationContent
                  className={
                    compact
                      ? `mx-auto w-full ${convoMaxW} gap-6 p-4 md:p-5`
                      : `mx-auto w-full ${convoMaxW} gap-6 p-4 md:p-6`
                  }
                >
                  {blocks.map((block) => {
                    if (block.kind === "message")
                      return renderMessage(block.message);
                    // Round IN FLIGHT: as soon as it carries a tool call, the whole round
                    // (its text included) is work and joins the unfolding.
                    // Otherwise its text is the response being written, displayed
                    // under the accordion — where the final message will remain.
                    const streamingIsWork =
                      block.active && state.activeToolCalls.length > 0;
                    const summaryReasoning = assistantMessageReasoning(
                      block.summary,
                    );
                    const events: WorkEvent<ReactNode>[] = [];
                    const addReasoning = (
                      key: string,
                      reasoning: ReturnType<typeof assistantMessageReasoning>,
                    ) => {
                      if (reasoning) events.push({
                        key,
                        kind: "action",
                        content: renderReasoning(key, reasoning),
                      });
                    };
                    for (const msg of block.work) {
                      if (askUserReplies.hiddenBubbleIds.has(msg.id)) continue;
                      addReasoning(`${msg.id}-reasoning`, assistantMessageReasoning(msg));
                      if (msg.content?.trim()) {
                        events.push({
                          key: `${msg.id}-text`,
                          kind: "text",
                          content: renderMessage({ ...msg, tool_calls: [] }),
                        });
                      }
                      const calls = (msg.tool_calls ?? []).filter((call) =>
                        !(call.function.name === "ask_user" && msg.id === activeAskUser?.messageId),
                      );
                      if (calls.length > 0) {
                        events.push({
                          key: `${msg.id}-actions`,
                          kind: "action",
                          count: calls.length,
                          active: calls.some((call) => state.toolCallResults.get(call.id)?.status === "running"),
                          revealKey: liveSecretRevealKey(calls.map((call) => ({
                            id: call.id,
                            name: call.function.name,
                            ...state.toolCallResults.get(call.id),
                          }))),
                          content: renderMessage({ ...msg, content: null, tool_calls: calls }),
                        });
                      }
                    }
                    addReasoning(`${block.summary?.id ?? block.key}-reasoning`, summaryReasoning);
                    if (block.active && state.streamingReasoning) {
                      events.push({
                        key: "streaming-reasoning",
                        kind: "action",
                        active: state.streamingReasoning.active,
                        content: (
                          <ReasoningBlock
                            active={state.streamingReasoning.active}
                            durationMs={state.streamingReasoning.durationMs}
                            text={state.streamingReasoning.text}
                          />
                        ),
                      });
                    }
                    if (streamingIsWork) {
                      if (state.streamingContent.trim()) {
                        events.push({
                          key: "streaming-text",
                          kind: "text",
                          content: <StreamingMessage content={state.streamingContent} activeToolCalls={[]} />,
                        });
                      }
                      const calls = state.activeToolCalls.filter((call) => call.name !== "ask_user");
                      if (calls.length > 0) {
                        events.push({
                          key: "streaming-actions",
                          kind: "action",
                          count: calls.length,
                          active: calls.some((call) => call.status === "running"),
                          revealKey: liveSecretRevealKey(calls),
                          content: <StreamingMessage content="" activeToolCalls={calls} />,
                        });
                      }
                    }
                    const hasWork = events.length > 0;
                    return (
                      <div key={block.key} className="flex flex-col gap-3">
                        {hasWork && (
                          <WorkAccordion
                            startedAt={block.startedAt}
                            endedAt={block.endedAt}
                            active={block.active}
                            revealKey={workEventsRevealKey(events)}
                          >
                            <WorkEvents events={events} />
                          </WorkAccordion>
                        )}
                        {block.summary ? renderMessage(block.summary) : null}
                        {block.active &&
                        !streamingIsWork &&
                        state.streamingContent ? (
                          <StreamingMessage
                            content={state.streamingContent}
                            activeToolCalls={[]}
                          />
                        ) : null}
                      </div>
                    );
                  })}

                  {(showThinking || isGeneratingServer) && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <NumoIcon
                        state="thinking"
                        className="size-4 text-muted-foreground"
                      />
                      <span>
                        {isGeneratingServer
                          ? t("generatingServer")
                          : t("thinking")}
                      </span>
                    </div>
                  )}

                  {state.error && (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      role="alert"
                    >
                      <span>{state.error}</span>
                      {(state.turnStatus === "retryable" || state.turnStatus === "failed") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => void retry()}
                        >
                          {t("retry")}
                        </Button>
                      )}
                    </div>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            ) : (
              /* Empty state — a centered set of useful first actions. */
              <div className="flex flex-1 items-center justify-center px-4">
                <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                  {STARTERS.map(({ key, icon: Icon, iconClassName }) => {
                    const title = t(`starter.${key}.title` as const);
                    const prompt = t(`starter.${key}.prompt` as const);
                    return (
                      <Button
                        key={key}
                        className="h-auto min-h-32 w-full flex-col items-start justify-between gap-8 rounded-xl px-5 py-5 text-left whitespace-normal"
                        onClick={() => chatInputRef.current?.fill(prompt)}
                        type="button"
                        variant="outline"
                      >
                        <Icon
                          className={cn("size-5 shrink-0", iconClassName)}
                          aria-hidden
                        />
                        <span className="text-sm leading-5">{title}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className={cn(
                `mx-auto w-full min-w-0 ${convoMaxW} shrink-0`,
                compact ? "px-1.5 pb-1.5" : "px-2 md:px-0",
                // Empty states retain a small bottom cushion outside compact mode.
                !hasMessages && !compact && "pb-2",
              )}
            >
              {/* Active question: the card takes the PLACE of the composer. THE
 ChatInput remains MOUNTED (hidden in CSS) — its draft and its
 focus scope survive, it reappears intact after the response. */}
              {activeAskUser && (
                <AskUserCard
                  key={activeAskUser.messageId}
                  questions={activeAskUser.questions}
                  onAnswer={(answer) => handleAnswer(answer, activeAskUser.workerInput)}
                  onSkip={() => handleSkipQuestions(activeAskUser.workerInput)}
                />
              )}
              <div className={cn(activeAskUser && "hidden")}>
                <ChatInput
                  onNavigate={onClose}
                  ref={chatInputRef}
                  onSend={handleSend}
                  onAbort={abort}
                  isStreaming={isBusy}
                  sendWhileStreaming={isGeneratingServer}
                  beam={isBusy}
                  noBorder={!hasMessages}
                  disabled={aiAvailability.loading}
                  mentionables={mentionables}
                  onMentionQuery={onMentionQuery}
                  onAddContext={addPinned}
                  leadingControls={<ConversationSettings />}
                  commands={slashCommands}
                  skills={projectId ? repositorySkills.skills : undefined}
                  loadSkill={repositorySkills.load}
                  contextSlot={(attachments: ChatInputContextAttachments) => (
                    <AssistantContextBar
                      chips={chips}
                      resources={attachments.resources}
                      pending={attachments.pending}
                      disabledKeys={disabledKeys}
                      onToggle={toggleChip}
                      onRemove={removePinned}
                      onRemoveResource={attachments.onRemove}
                      onRemovePending={attachments.onRemovePending}
                      onAdd={addPinned}
                      scopeProjectId={projectId}
                      showAddButton={false}
                    />
                  )}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // The “@” pills of a message ALREADY sent lead to what they quote — a
  // ticket, one objective, one page (components/mention-links). Compose him,
  // has no destinations: you write there, and a click places the cursor there.
  return <MentionLinksProvider value={links}>{shell}</MentionLinksProvider>;
});
