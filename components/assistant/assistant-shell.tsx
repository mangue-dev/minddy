"use client";

import { useMobileLayout } from "@/lib/use-mobile-layout";

import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon, Clock01Icon, CollapseIcon, ExpandIcon } from "@hugeicons/core-free-icons";
import { usePathname } from "next/navigation";
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
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NumoIcon } from "@/components/numo-icon";
import { useTypeaheadTarget } from "@/lib/keyboard/typeahead";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useAssistantChatContext } from "@/lib/assistant-chat-context";
import { useOptionalAssistantPanelActions } from "@/lib/assistant-panel-context";
import {
  type ChatInputContextAttachments,
  type ChatInputHandle,
} from "@/components/assistant/chat-input";
import { AssistantChatInput } from "@/components/assistant/assistant-chat-input";
import { ConversationSettings } from "@/components/assistant/conversation-settings";
import {
  ChatMessage,
  StreamingMessage,
} from "@/components/assistant/chat-message";
import { AskUserCard } from "@/components/assistant/ask-user-card";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import {
  GeneratedFileCards,
  generatedFilesOf,
} from "@/components/assistant/generated-file-cards";
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
  SELECTION_CHIP_KEY,
  withPinnedContext,
} from "@/lib/assistant-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import { numoCitations, numoCitedMentions } from "@/lib/numo-cited-mentions";
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
import Link from "@/components/app-link";
import { useAiSurfaceAvailability } from "@/lib/use-ai-surface-availability";
import { ReasoningBlock, ThinkingStep } from "@/components/agent/reasoning-block";
import { WatchProposalCard, watchProposalsOf } from "@/components/assistant/watch-proposal-card";
import { assistantMessageReasoning } from "@/lib/assistant-reasoning";
import { SidebarFilterField } from "@/components/sidebar-filter-field";
import { SIDEBAR_HEADER_ACTION_CLASS } from "@/lib/sidebar-control-styles";
import { assistantStarterPage } from "@/lib/assistant-starters";
import { AssistantStarterList } from "@/components/assistant/assistant-starter-list";

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
      intent?: AssistantChatRequest["intent"];
    },
  ) => void;
  /** Pre-fill the composer without sending. */
  fill: (text: string) => void;
  /** Put the caret in the composer without changing its draft. */
  focus: () => void;
  /** Start a new conversation, as the header's new-conversation button does. */
  newConversation: () => void;
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
  /** Render one durable conversation inside another page without history chrome. */
  embeddedConversationId?: string | null;
  /** False while the panel closes or prepares another conversation. */
  visible?: boolean;
  /**
   * A page that holds the shell as its main view (Home, MIN-930) gives it
   * its own controls: no history, expand, new-conversation or close header.
   */
  hideHeader?: boolean;
  /** Open on a new conversation instead of restoring the last one. */
  startFresh?: boolean;
  /** What an empty conversation shows (Home: the greeting and Numo's word). */
  intro?: ReactNode;
  /**
   * What stays on top of a conversation started under the intro, as it was
   * when the first message left (Home: Numo's word, as its first message).
   * Nothing stays when absent.
   */
  keptIntro?: ReactNode;
  /**
   * What stays above that conversation for as long as it is shown, even once
   * its stored opening replaces `keptIntro` (Home: the greeting, kept with
   * Numo's word). Nothing stays when absent.
   */
  keptHeader?: ReactNode;
  /**
   * Numo's Home summary shown under the intro (MIN-933): the first message
   * sent there carries it, and the server opens the conversation with it as
   * Numo's first message.
   */
  openingBriefId?: string | null;
  /**
   * Numo's text shown above the conversation without being one of its
   * messages (Home: its word). Its mentions lead the "@" menu with those of
   * Numo's replies (MIN-969).
   */
  citedByNumo?: string | null;
  /** Rows written for the user in place of the page's fixed suggestions; null keeps them. */
  starterItems?: ReadonlyArray<{ label: string; prompt: string }> | null;
  /** The written rows are still loading: show no row yet. */
  startersPending?: boolean;
  /**
   * On a phone, hide the suggestion rows while the composer has the focus
   * (Home): with the keyboard up they took the room right above it, between
   * the field and the conversation.
   */
  hideStartersWhileComposing?: boolean;
  /** Shown instead of the "no AI provider" screen (Home keeps its greeting). */
  unavailableFallback?: ReactNode;
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
    embeddedConversationId = null,
    visible = true,
    hideHeader = false,
    startFresh = false,
    intro = null,
    keptIntro = null,
    keptHeader = null,
    openingBriefId = null,
    citedByNumo = null,
    starterItems = null,
    startersPending = false,
    hideStartersWhileComposing = false,
    unavailableFallback = null,
  },
  ref
) {
  const isExpanded = displayMode === "expanded";
  // Expanded mode keeps the conversation centered (mx-auto) but widens the
  // reading column to use more of the larger surface.
  const mobile = useMobileLayout() === true;
  const convoMaxW = isExpanded ? "max-w-4xl" : "max-w-3xl";
  const t = useTranslations("Assistant");
  const tc = useTranslations("Common");
  const tToolCall = useTranslations("ToolCall");
  const tSeed = useTranslations("Seed");
  const aiAvailability = useAiSurfaceAvailability("assistant");

  // The controller and composer state live above both projections. Unmounting
  // this shell therefore moves the conversation without resetting it.
  const {
    state,
    sendMessage,
    loadConversation,
    reset,
    retry,
    reconnect,
    resend,
    abort,
    restoring,
    requestRestore,
    markResponseRead,
    pinned,
    setPinned,
  } = useAssistantChatContext();
  // The error card's one action: retry a failed turn, re-read a request the
  // connection loss hid, or send again a message minddy never received.
  const errorActionHandler = state.connectionIssue === "undelivered"
    ? { label: t("resend"), run: resend }
    : state.connectionIssue === "lost"
      ? { label: t("retry"), run: () => void reconnect() }
      : state.turnStatus === "retryable" || state.turnStatus === "failed"
        ? { label: t("retry"), run: () => void retry() }
        : null;
  const errorAction = errorActionHandler ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={errorActionHandler.run}
    >
      {errorActionHandler.label}
    </Button>
  ) : null;
  const chatInputRef = useRef<ChatInputHandle>(null);
  const shellRootRef = useRef<HTMLDivElement>(null);
  // A burst typed in the shell goes to its composer, a single key stays a
  // shortcut (lib/keyboard/typeahead.ts). The expanded panel owns the screen;
  // the compact panel and an embedded conversation only take keys pressed
  // while the focus is inside them.
  useTypeaheadTarget(visible ? {
    accepts: (target) =>
      (isExpanded && !embeddedConversationId) ||
      (target instanceof Node && !!shellRootRef.current?.contains(target)),
    type: (text) => chatInputRef.current?.append(text),
  } : null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [visibleConversationCount, setVisibleConversationCount] = useState(0);

  useEffect(() => {
    if (embeddedConversationId) {
      if (state.conversationId !== embeddedConversationId) {
        void loadConversation(embeddedConversationId, null);
      }
      return;
    }
    // Also for a fresh start: the new conversation is a choice, which the
    // restore never replaces, and the restore marks the session restored.
    requestRestore();
  }, [embeddedConversationId, loadConversation, requestRestore, state.conversationId]);
  useEffect(() => {
    if (!visible || restoring || state.status !== "idle" || !state.conversationId) return;
    if (embeddedConversationId && embeddedConversationId !== state.conversationId) return;
    markResponseRead(state.conversationId);
  }, [visible, restoring, state.status, state.conversationId, embeddedConversationId, markResponseRead]);

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

  // The quoted selection lives in the panel's session context, not in the
  // pins: removing its pill drops it there.
  const panelActions = useOptionalAssistantPanelActions();
  const clearSelectionContext = panelActions?.clearSelectionContext;

  const removePinned = useCallback((key: string) => {
    if (key === SELECTION_CHIP_KEY) {
      clearSelectionContext?.();
      return;
    }
    setPinned((prev) =>
      prev.filter((item) => `pinned:${item.kind}:${item.id}` !== key),
    );
  }, [setPinned, clearSelectionContext]);

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
  const { mentionables: catalog, links, onMentionQuery } = useNumoMentionables(projectId, messageReferences);
  // What Numo cited leads the "@" menu (MIN-969): its latest reply first,
  // then the earlier ones, then the word Home opens with.
  const locale = useLocale();
  const citations = useMemo(() => numoCitations([
    ...state.messages.flatMap((message) => (message.role === "assistant" && message.content ? [message.content] : [])).reverse(),
    citedByNumo,
  ]), [state.messages, citedByNumo]);
  const mentionables = useMemo(
    () => numoCitedMentions(catalog, citations, locale),
    [catalog, citations, locale],
  );

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
              ...(opts?.intent ? { intent: opts.intent } : {}),
            }),
      fill: (text) => chatInputRef.current?.fill(text),
      focus: () => chatInputRef.current?.focus(),
      newConversation: () => {
        reset();
        resetContextSelection();
        setRefreshKey((k) => k + 1);
        setKept(null);
      },
    }),
    [aiAvailability.available, aiAvailability.loading, sendMessage, reset, resetContextSelection]
  );

  // What stays on top of the conversation sent from under the intro (see
  // `keptIntro`); `null` once a new conversation starts.
  const [kept, setKept] = useState<{
    node: ReactNode;
    header: ReactNode;
    conversationId: string | null;
  } | null>(null);
  const keptIntroRef = useRef<ReactNode>(keptIntro);
  keptIntroRef.current = keptIntro;
  const keptHeaderRef = useRef<ReactNode>(keptHeader);
  keptHeaderRef.current = keptHeader;
  const openingBriefRef = useRef<string | null>(openingBriefId);
  openingBriefRef.current = openingBriefId;
  const blankRef = useRef(true);
  blankRef.current = !state.conversationId && state.messages.length === 0;

  const handleSend = useCallback(
    (
      message: string,
      attachments: ResourceInput[] = [],
      mentions: AssistantMention[] = [],
      command?: AssistantCommandId,
      skills: AssistantSkillSelection[] = [],
      intent?: AssistantChatRequest["intent"],
    ) => {
      if (!aiAvailability.loading && !aiAvailability.available) return;
      const opening = blankRef.current ? openingBriefRef.current : null;
      if (blankRef.current) {
        setKept(keptIntroRef.current || keptHeaderRef.current
          ? { node: keptIntroRef.current, header: keptHeaderRef.current, conversationId: null }
          : null);
      }
      const sentContext = effectiveContextRef.current;
      sendMessage(sentContext?.projectId ?? null, message, {
        pageContext: sentContext,
        attachments,
        mentions,
        command,
        skills,
        intent,
        ...(opening ? { homeBriefId: opening } : {}),
      });
      // A quoted selection is asked about once. Unlike the page context, which
      // keeps riding on follow-ups while the session stays on that page, and
      // the pins, which the user removes by hand, the selection belongs to
      // the message written about it: it stays on that message (its badge,
      // and Numo's history) but is not silently re-sent with unrelated
      // follow-ups. "Ask Numo" on a new selection attaches it again.
      if (sentContext?.selection) clearSelectionContext?.();
    },
    [aiAvailability.available, aiAvailability.loading, sendMessage, clearSelectionContext]
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
    (text: string) => {
      if (!text.trim()) return;
      handleSend(text);
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
    setKept(null);
  }, [reset, resetContextSelection]);

  const isStreaming =
    state.status === "streaming" || state.status === "executing_tool";
  const isGeneratingServer = state.status === "generating_server";
  const isBusy = isStreaming || isGeneratingServer;

  // Home opens on a new conversation each time it is shown (MIN-930); the
  // one before stays in the history. Tabs keep Home mounted and only re-run
  // its effects when it is shown again, hence an effect with no dependency,
  // reading the latest state. A conversation with a turn still running is
  // left as it is: starting over would cut it off. The reset is silent: Home
  // opening is not the user asking for a new conversation.
  const freshStartRef = useRef({ startFresh, isBusy, reset, resetContextSelection });
  freshStartRef.current = { startFresh, isBusy, reset, resetContextSelection };
  useEffect(() => {
    const current = freshStartRef.current;
    if (!current.startFresh || current.isBusy) return;
    current.reset({ silent: true });
    current.resetContextSelection();
    setRefreshKey((k) => k + 1);
    setKept(null);
  }, []);

  // The kept intro tops the conversation sent from under the intro, from the
  // moment the message leaves (its id comes later) and for as long as that
  // conversation is shown. It is captured then: a later version of what the
  // host passes does not rewrite the conversation's opening.
  useEffect(() => {
    if (kept && kept.conversationId === null && state.conversationId) {
      setKept({ ...kept, conversationId: state.conversationId });
    }
  }, [kept, state.conversationId]);
  // Once the stored messages load, the summary is among them (MIN-933): it
  // is not shown a second time on top.
  const storedOpening = state.messages.some((message) =>
    message.role === "assistant" && typeof message.metadata?.home_brief === "string");
  const keptShown = kept !== null &&
    (kept.conversationId === null || kept.conversationId === state.conversationId);
  const keptOnTop = keptShown && !storedOpening;
  // One announcement per reply, once it has ended (see the log below).
  const [replyStatus, setReplyStatus] = useState("");
  const wasBusy = useRef(isBusy);
  useEffect(() => {
    if (wasBusy.current && !isBusy) setReplyStatus(t("replyAnnouncement"));
    else if (isBusy) setReplyStatus("");
    wasBusy.current = isBusy;
  }, [isBusy, t]);
  const hasMessages = state.messages.length > 0 || isBusy;
  // The suggestions follow the page under the composer and step aside as soon
  // as the user starts writing their own message.
  const pathname = usePathname();
  const starterPage = assistantStarterPage(pathname, pageContext);
  const [composerEmpty, setComposerEmpty] = useState(true);
  // On a phone only in the Numo sheet: Home keeps its page clear.
  // Whether the composer holds the focus: with `hideStartersWhileComposing`,
  // a phone hides the rows as soon as the keyboard is up, before a letter.
  const [composing, setComposing] = useState(false);
  const hiddenWhileComposing = hideStartersWhileComposing && mobile && composing;
  const showStarters = !hasMessages && (!mobile || compact) && composerEmpty && !hiddenWhileComposing && !embeddedConversationId && !startersPending;

  // Question ask_user ACTIVE: the last visible message is a message
  // assistant carrying a tool-call ask_user and Numo is at rest (he is waiting for the
  // answer). The VIVANTE card then replaces the composer (pattern Claude
  // Code/Codex); the corresponding thread bubble is hidden. The questions of
  // Past turns remain in the wire, inert.
  const activeAskUser = useMemo((): {
    messageId: string;
    questions: AskUserQuestion[];
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
      // A question a retired code worker asked (MIN-721) has no one left to
      // answer it: it stays in the thread, inert.
      if (args._worker_input) return null;
      return questions.length > 0 ? { messageId: m.id, questions } : null;
    }
    return null;
  }, [state.messages, isBusy]);

  // Skip questions: Numo receives an explicit user message and resumes.
  const handleSkipQuestions = useCallback(() => {
    handleSend(tToolCall("skippedQuestions"));
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
  // Numo's latest answer keeps its Copy button visible without hovering. The
  // set is built in reading order, so its last id is that answer.
  const latestCopyId = useMemo(() => [...copyButtonIds].at(-1), [copyButtonIds]);

  // Inside a turn, a reminder's approval card is drawn under the answer by
  // the turn itself (`watchProposalsOutside`), not inside the folded work.
  const renderMessage = (
    msg: AssistantMessage,
    afterContent?: ReactNode,
    watchProposalsOutside = false,
  ) =>
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
        pinCopyButton={msg.id === latestCopyId}
        afterContent={afterContent}
        watchProposalsOutside={watchProposalsOutside}
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

  const sidebarFilter = {
    value: historyQuery,
    onChange: setHistoryQuery,
    placeholder: t("filterConversations", { count: visibleConversationCount }),
    clearLabel: tc("clearFilter"),
  };
  const newConversationButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={SIDEBAR_HEADER_ACTION_CLASS}
          aria-label={t("newConversation")}
          onClick={handleNewConversation}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("newConversation")}</TooltipContent>
    </Tooltip>
  );
  const sidebarList = (
    <div className="p-2">
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
        query={historyQuery}
        onVisibleCountChange={setVisibleConversationCount}
      />
    </div>
  );

  // Compact-mode header: no permanent sidebar; conversations live in a
  // ResponsivePopover. The new-conversation and close buttons are grouped on the right.
  const compactHeader = compact && !embeddedConversationId && !hideHeader ? (
    <div
      ref={historyAnchorRef}
      data-mobile-sheet-header
      className="flex shrink-0 items-center gap-1 px-4 py-4"
    >
      <ResponsivePopover open={historyOpen} onOpenChange={setHistoryOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <ResponsivePopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("conversations")}
                data-mobile-sheet-lead
              >
                <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4" />
              </Button>
            </ResponsivePopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {t("conversations")}
          </TooltipContent>
        </Tooltip>
        <ResponsivePopoverContent
          mobileTitle={t("conversations")}
          side="bottom"
          align="start"
          sideOffset={6}
          container={historyContainer}
          className="flex max-h-[360px] w-72 flex-col gap-0 overflow-hidden p-0"
        >
          <div data-sheet-search className="flex h-11 shrink-0 items-center border-b border-border px-3">
            <SidebarFilterField {...sidebarFilter} />
          </div>
          <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto p-1.5 app-mobile:p-0">
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
              query={historyQuery}
              onVisibleCountChange={setVisibleConversationCount}
            />
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>

      {/* Compact ⇄ expanded toggle — desktop only (mobile is full-bleed). */}
      {onToggleDisplayMode && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden app-desktop:inline-flex"
              aria-label={isExpanded ? t("collapse") : t("expand")}
              // A click must not take the focus: the composer keeps it, and
              // its caret, while the panel changes size. Tab still reaches it.
              onMouseDown={(event) => event.preventDefault()}
              onClick={onToggleDisplayMode}
            >
              {isExpanded ? (
                <HugeiconsIcon icon={CollapseIcon} className="h-4 w-4" />
              ) : (
                <HugeiconsIcon icon={ExpandIcon} className="h-4 w-4" />
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
            <HugeiconsIcon icon={Add01Icon} className="h-4 w-4" />
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
              data-mobile-sheet-close
              aria-label={tc("close")}
              onClick={onClose}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
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
  const embeddedConversationFailed = Boolean(
    embeddedConversationId &&
      state.conversationId !== embeddedConversationId &&
      state.status === "error",
  );
  const embeddedConversationLoading = Boolean(
    embeddedConversationId &&
      state.conversationId !== embeddedConversationId &&
      !embeddedConversationFailed,
  );
  const shell = unavailable && unavailableFallback ? (
    <>{unavailableFallback}</>
  ) : unavailable ? (
    <div className="relative flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      {onClose ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2"
          data-mobile-sheet-close
          aria-label={tc("close")}
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
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
        <Link href="/settings?tab=ai">{t("providerUnavailableCta")}</Link>
      </Button>
    </div>
  ) : (
    <div ref={shellRootRef} className="flex h-full overflow-hidden">
      {/* Permanent sidebar — only outside compact mode. */}
      {!compact && (
        <SecondarySidebar
          title={t("title")}
          filter={sidebarFilter}
          actions={newConversationButton}
          hiddenOnMobile
        >
          {sidebarList}
        </SecondarySidebar>
      )}

      {/* Mobile sidebar sheet — only outside compact mode (compact uses ResponsivePopover). */}
      {!compact && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0 app-desktop:hidden">
            <SheetTitle className="sr-only">{t("title")}</SheetTitle>
            <div className="flex h-full min-h-0 flex-col bg-sidebar">
              <div className="secondary-sidebar-header flex h-[var(--app-content-header-height)] shrink-0 items-center gap-2 border-b border-border pr-2.5 pl-[19px]">
                <SidebarFilterField {...sidebarFilter} />
                {newConversationButton}
              </div>
              <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto">
                {sidebarList}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Main chat area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {compactHeader}

        {/* Mobile conversations toggle — non-compact only. */}
        {!compact && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 app-desktop:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setMobileSidebarOpen(true)}
            >
              <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4" />
              <span className="text-xs">{t("title")}</span>
            </Button>
            {mobileSubtitle && (
              <span className="truncate text-xs text-muted-foreground">
                {mobileSubtitle}
              </span>
            )}
          </div>
        )}

        {embeddedConversationFailed ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <div
              className="max-w-lg rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {state.error}
            </div>
          </div>
        ) : embeddedConversationLoading || (!hasMessages && restoring && !startFresh) ? (
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
            <span role="status" className="sr-only">{replyStatus}</span>
            {hasMessages ? (
              <Conversation
                className="min-h-0 flex-1"
                anchor={scrollAnchor}
                // Silent while a reply streams: screen readers differ on
                // whether `aria-busy` holds a log's announcements, and none
                // should read each token. The status below says when the
                // reply has ended (4.1.3).
                aria-busy={isBusy}
                aria-live={isBusy ? "off" : "polite"}
              >
                <ConversationContent
                   className={
                     compact
                       ? `mx-auto w-full ${convoMaxW} gap-6 p-4 app-desktop:p-4`
                       : `mx-auto w-full ${convoMaxW} gap-6 p-4 app-desktop:p-6`
                   }
                 >
                  {keptShown ? kept?.header : null}
                  {keptOnTop ? kept?.node : null}
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
                      const visibleCalls = (msg.tool_calls ?? []).filter((call) =>
                        !(call.function.name === "ask_user" && msg.id === activeAskUser?.messageId),
                      );
                      const calls = visibleCalls;
                      if (calls.length > 0) {
                        const toolCalls = calls.map((call) => {
                          const result = state.toolCallResults.get(call.id);
                          return {
                            id: call.id,
                            name: call.function.name,
                            arguments: call.function.arguments,
                            status: result?.status ?? "running",
                            result: result?.result,
                            success: result?.success ?? true,
                          };
                        });
                        events.push({
                          key: `${msg.id}-actions`,
                          kind: "action",
                          count: calls.length,
                          active: toolCalls.some((call) => call.status === "running"),
                          toolCalls,
                          revealKey: liveSecretRevealKey(calls.map((call) => ({
                            id: call.id,
                            name: call.function.name,
                            ...state.toolCallResults.get(call.id),
                          }))),
                          content: renderMessage({ ...msg, content: null, tool_calls: calls }, undefined, true),
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
                      const calls = state.activeToolCalls.filter(
                        (call) => call.name !== "ask_user",
                      );
                      if (calls.length > 0) {
                        events.push({
                          key: "streaming-actions",
                          kind: "action",
                          count: calls.length,
                          active: calls.some((call) => call.status === "running"),
                          toolCalls: calls,
                          revealKey: liveSecretRevealKey(calls),
                          content: <StreamingMessage content="" activeToolCalls={calls} />,
                        });
                      }
                    }
                    // A turn opens on its accordion at once, with a Thinking
                    // step until something streams: the first real step takes
                    // that step's place (same key as live reasoning), so the
                    // thread does not jump when the work starts. A reply that
                    // streams text with no work stays a plain answer.
                    if (
                      block.active &&
                      isStreaming &&
                      events.length === 0 &&
                      !block.summary &&
                      !state.streamingContent
                    ) {
                      events.push({
                        key: "streaming-reasoning",
                        kind: "action",
                        active: true,
                        content: <ThinkingStep />,
                      });
                    }
                    const hasWork = events.length > 0;
                    // The files Numo wrote close the turn, under its answer (MIN-793).
                    const files = block.active ? [] : generatedFilesOf(
                      [...block.work, ...(block.summary ? [block.summary] : [])]
                        .flatMap((msg) => msg.tool_calls ?? []),
                      state.toolCallResults,
                    );
                    const fileCards = files.length > 0
                      ? <GeneratedFileCards files={files} />
                      : null;
                    const summaryCarriesFiles = Boolean(block.summary?.content);
                    // A reminder waiting for the user's approval sits under the
                    // answer, where it is seen, not in the folded work.
                    const watchCards = watchProposalsOf(
                      [...block.work, ...(block.summary ? [block.summary] : [])]
                        .flatMap((msg) => msg.tool_calls ?? []),
                      state.toolCallResults,
                      block.active ? state.activeToolCalls : [],
                    ).map((proposal) => (
                      <WatchProposalCard key={`watch-${proposal.id}`} proposal={proposal} />
                    ));
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
                        {block.summary
                          ? renderMessage(block.summary, summaryCarriesFiles ? fileCards : undefined, true)
                          : null}
                        {summaryCarriesFiles ? null : fileCards}
                        {block.active &&
                        !streamingIsWork &&
                        state.streamingContent ? (
                          <StreamingMessage
                            content={state.streamingContent}
                            activeToolCalls={[]}
                          />
                        ) : null}
                        {watchCards}
                      </div>
                    );
                  })}

                  {isGeneratingServer && (
                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                      <NumoIcon
                        state="thinking"
                        className="size-4 text-muted-foreground"
                      />
                      <span>{t("generatingServer")}</span>
                    </div>
                  )}

                  {state.error && (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      role="alert"
                    >
                      <span>{state.error}</span>
                      {errorAction}
                    </div>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            ) : (
              /* Empty state — the host's intro and the error; the suggestions
                 sit above the composer. */
              <div className={cn("flex flex-1 justify-center", intro ? "overflow-y-auto" : "items-center px-4")}>
                {/* An intro takes the composer's own box (same width, same
                    gutter), so its text never runs wider than the input. */}
                <div className={cn(
                  "flex w-full min-w-0 flex-col gap-4",
                  intro ? cn(`mx-auto ${convoMaxW} py-6`, compact ? "px-4" : "px-2 app-desktop:px-0") : "max-w-2xl",
                )}>
                  {intro}
                  {state.error ? (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      role="alert"
                    >
                      <span>{state.error}</span>
                      {errorAction}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* The composer never moves: sticky keeps it pinned to the
            visible bottom even when a host lets the column scroll, and the
            fixed bottom padding keeps it off the edge of the content zone. */}
            <div
              data-keyboard-dock
              // Only a field counts: a suggestion row is in this dock too.
              onFocus={(event) => setComposing(isTextEntry(event.target))}
              onBlur={(event) => {
                const next = event.relatedTarget;
                setComposing(next instanceof Node && event.currentTarget.contains(next) && isTextEntry(next));
              }}
              className={cn(
                `mx-auto w-full min-w-0 ${convoMaxW} shrink-0`,
                compact ? "px-4" : "px-2 app-desktop:px-0",
                "sticky bottom-0 pb-4",
              )}
            >
              <AssistantStarterList
                page={starterPage}
                visible={showStarters}
                items={starterItems}
                // In the phone's sheet the rows span the composer's width; in
                // the desktop panel they keep their inset, in line with the
                // composer's + button.
                className={compact ? "mx-0 flex app-desktop:mx-2.5" : undefined}
                onPick={(prompt) => chatInputRef.current?.fill(prompt)}
              />
              {/* Active question: the card takes the PLACE of the composer. THE
 ChatInput remains MOUNTED (hidden in CSS) — its draft and its
 focus scope survive, it reappears intact after the response. */}
              {activeAskUser && (
                <AskUserCard
                  key={activeAskUser.messageId}
                  questions={activeAskUser.questions}
                  onAnswer={handleAnswer}
                  onSkip={handleSkipQuestions}
                />
              )}
              <div className={cn(activeAskUser && "hidden")}>
                <AssistantChatInput
                  ref={chatInputRef}
                  // The composer carries its own legacy 12px click margin
                  // (MIN-167); the shell's concentric 16px gutter replaces it.
                  className="px-0 py-0 pb-0"
                  onSend={handleSend}
                  onEmptyChange={setComposerEmpty}
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

/** A field one writes in: the composer's editor, or any text input. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
}
