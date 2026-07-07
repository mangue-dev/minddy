"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import { useTranslations } from "next-intl";
import { History, Maximize2, Minimize2, Plus, X } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import {
  ChatInput,
  type ChatInputHandle,
} from "@/components/assistant/chat-input";
import {
  assistantCopyMessageIds,
  ChatMessage,
  StreamingMessage,
} from "@/components/assistant/chat-message";
import { ConversationList } from "@/components/assistant/conversation-list";
import type { AssistantPageContext } from "@/lib/assistant-types";

const STARTER_KEYS = ["s1", "s2", "s3", "s4"] as const;

export type AssistantDisplayMode = "compact" | "expanded";

export interface AssistantShellHandle {
  /** Send a message. `projectId` null = global mode. The optional
   *  pageContext rides on this one send (used by contextual one-shot opens). */
  sendMessage: (
    projectId: string | null,
    message: string,
    pageContext?: AssistantPageContext | null,
  ) => void;
  /** Pre-fill the composer without sending. */
  fill: (text: string) => void;
}

export interface AssistantShellProps {
  /** null = global assistant (no project context). */
  projectId: string | null;
  /** Appended after "Assistant" in the empty-state title. null = no suffix. */
  titleSuffix?: string | null;
  /** Which i18n key to render under the empty-state title. */
  descriptionKey?: "emptyDescription" | "globalPlaceholder";
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
  /** Skip the localStorage "restore last conversation" on mount. Use when
   *  the host is about to dispatch a pending action (prompt/draft) that
   *  would otherwise race with the async restore and lose state. */
  skipRestore?: boolean;
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
    titleSuffix = null,
    descriptionKey = "emptyDescription",
    mobileSubtitle,
    compact = false,
    displayMode = "compact",
    onToggleDisplayMode,
    onClose,
    skipRestore = false,
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
  const { state, sendMessage, loadConversation, reset, abort } =
    useAssistantChat();
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

  // Persist the active conversation per scope (global vs per-project) so
  // re-opening the panel reuses the last conversation the user was in.
  const storageKey = useMemo(
    () => `assistant-active-conv-${projectId ?? "global"}`,
    [projectId],
  );
  const hasRestoredRef = useRef(false);
  // Freeze the skipRestore decision at mount time. If the host clears the
  // flag mid-flight (e.g. pendingOptions consumed) we still don't want the
  // restore to fire and race with the just-dispatched action.
  const initialSkipRestoreRef = useRef(skipRestore);

  // True while a previously-active conversation is being restored from storage.
  // Seeded synchronously from localStorage so the very first paint shows a quiet
  // loader instead of the empty-state greeting — otherwise the greeting flashes
  // and gets replaced ~one fetch later, which reads as a stutter on reopen.
  const [restoring, setRestoring] = useState(() => {
    if (typeof window === "undefined") return false;
    // Lazy initializer runs once at mount, so the live prop is the mount-time
    // value — no need to read initialSkipRestoreRef (and reading a ref here
    // would be a render-phase access).
    if (skipRestore) return false;
    try {
      return Boolean(window.localStorage.getItem(storageKey));
    } catch {
      return false;
    }
  });

  // Restore on mount (and whenever the scope changes).
  useEffect(() => {
    if (typeof window === "undefined") return;
    hasRestoredRef.current = false;

    if (initialSkipRestoreRef.current) {
      // Host has a pending action — allow the persist effect to run later
      // but don't read from storage. The lazy initializer already seeded
      // `restoring` to false for this path.
      hasRestoredRef.current = true;
      return;
    }

    let cancelled = false;

    void (async () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(storageKey);
      } catch {
        // localStorage unavailable — skip restore.
      }
      // Mirror the seeded loader for scope changes that reuse this instance.
      if (!cancelled) setRestoring(Boolean(saved));
      if (saved && !cancelled) {
        try {
          await loadConversation(saved);
        } catch {
          // Stale id (deleted, inaccessible, network failure) — clear it
          // so we don't keep retrying a broken conversation.
          if (!cancelled) {
            try {
              window.localStorage.removeItem(storageKey);
            } catch {}
          }
        }
      }
      if (!cancelled) {
        hasRestoredRef.current = true;
        setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey, loadConversation]);

  // Mirror conversationId changes back to localStorage. Skip until the
  // initial restore is done so we don't briefly wipe a saved value at mount.
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    if (typeof window === "undefined") return;
    try {
      if (state.conversationId) {
        window.localStorage.setItem(storageKey, state.conversationId);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Quota / private mode — ignore.
    }
  }, [storageKey, state.conversationId]);

  // Latest page context (e.g. the issue being viewed), read by send handlers
  // without stale closures. The host may set it the same tick it dispatches a
  // one-shot send, so the imperative sendMessage also takes an explicit
  // override to avoid that race.
  const pageContextRef = useRef<AssistantPageContext | null>(pageContext);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  // Expose imperative controls to the host page (URL-param driven flows).
  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (pid, msg, ctx) =>
        sendMessage(pid, msg, {
          pageContext: ctx !== undefined ? ctx : pageContextRef.current,
        }),
      fill: (text) => chatInputRef.current?.fill(text),
    }),
    [sendMessage]
  );

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(projectId, message, {
        pageContext: pageContextRef.current,
      });
    },
    [projectId, sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (text: string) => {
      if (!text) return;
      handleSend(text);
    },
    [handleSend]
  );

  // Only the last assistant message of each turn carries a Copy button.
  const copyButtonIds = useMemo(
    () => assistantCopyMessageIds(state.messages),
    [state.messages]
  );

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      loadConversation(conversationId);
    },
    [loadConversation]
  );

  const handleNewConversation = useCallback(() => {
    reset();
    setRefreshKey((k) => k + 1);
  }, [reset]);

  const isStreaming =
    state.status === "streaming" || state.status === "executing_tool";
  const isGeneratingServer = state.status === "generating_server";
  const isBusy = isStreaming || isGeneratingServer;
  const hasMessages = state.messages.length > 0 || isBusy;

  const allToolCallsComplete =
    state.activeToolCalls.length > 0 &&
    state.activeToolCalls.every((tc) => tc.status === "complete");
  const showThinking =
    isStreaming &&
    !state.streamingContent &&
    (state.activeToolCalls.length === 0 || allToolCallsComplete);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <ConversationList
          projectId={projectId}
          activeConversationId={state.conversationId}
          onSelect={(id) => {
            handleSelectConversation(id);
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
  // Popover and "new conversation" is a single + icon button. The close
  // button (X) is aligned to the right when an onClose handler is provided.
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
            projectId={projectId}
            activeConversationId={state.conversationId}
            onSelect={(id) => {
              handleSelectConversation(id);
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
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

      {titleSuffix && (
        <span className="ml-1 min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {titleSuffix}
        </span>
      )}

      {onClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={titleSuffix ? "" : "ml-auto"}
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

  return (
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
        ) : !hasMessages ? (
          /* Empty state — Numo greeting centered, suggestions + composer pinned. */
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <NumoIcon state="idle" className="size-12 text-foreground" />
              <div className="max-w-xs space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t("greeting")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(descriptionKey)}
                </p>
              </div>
            </div>
            <div
              className={
                compact
                  ? `mx-auto w-full min-w-0 ${convoMaxW} shrink-0 space-y-3 px-1.5 pb-1.5`
                  : `mx-auto w-full min-w-0 ${convoMaxW} shrink-0 space-y-3 px-2 pb-2 md:px-0`
              }
            >
              <div className="overflow-hidden px-3">
                <Suggestions>
                  {STARTER_KEYS.map((k) => {
                    const prompt = t(`starter.${k}` as const);
                    return (
                      <Suggestion
                        key={k}
                        suggestion={prompt}
                        onClick={handleSuggestionClick}
                      />
                    );
                  })}
                </Suggestions>
              </div>
              <ChatInput
                ref={chatInputRef}
                onSend={handleSend}
                onAbort={abort}
                isStreaming={isBusy}
                noBorder
                pageContext={pageContext}
              />
            </div>
          </div>
        ) : (
          <>
            <Conversation className="min-h-0 flex-1" initial="instant">
              <ConversationContent
                className={
                  compact
                    ? `mx-auto w-full ${convoMaxW} gap-6 p-4 md:p-5`
                    : `mx-auto w-full ${convoMaxW} gap-6 p-4 md:p-6`
                }
              >
                {state.messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    toolCallResults={state.toolCallResults}
                    onSuggestionClick={handleSuggestionClick}
                    showCopyButton={copyButtonIds.has(msg.id)}
                  />
                ))}

                {isStreaming && (
                  <StreamingMessage
                    content={state.streamingContent}
                    activeToolCalls={state.activeToolCalls}
                  />
                )}

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
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {state.error}
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div
              className={
                compact
                  ? `mx-auto w-full ${convoMaxW} shrink-0 px-1.5 pb-1.5`
                  : `mx-auto w-full ${convoMaxW} shrink-0 px-2 md:px-0`
              }
            >
              <ChatInput
                ref={chatInputRef}
                onSend={handleSend}
                onAbort={abort}
                isStreaming={isStreaming}
                pageContext={pageContext}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});
