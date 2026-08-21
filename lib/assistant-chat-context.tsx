"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTheme } from "mangue-ui/components/theme-provider";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { resolveAssistantScope } from "@/lib/assistant-scope";
import { hasResumableConversation } from "@/lib/assistant-resumable";
import {
  fetchActiveConversation,
  setActiveConversation,
} from "@/lib/assistant-api";
import { useAuth } from "@/lib/auth-context";
import { setLocaleCookie } from "@/lib/set-locale";
import { isAccountTheme } from "@/lib/account-theme";

/**
 * The Numo conversation LIVES ABOVE the panel, not in it.
 *
 * The `AssistantPanel` Sheet unmounts its contents when closed: as long as the
 * cat lived in `AssistantShell`, close the panel for a turn threw
 * the state (the SSE flow continued to dispatch in a dead reducer) and reopen
 * restarted from a restore. By hoisting `useAssistantChat` here, the trick
 * CONTINUES in the background, the shell is just a view, and the FAB can display
 * its border as long as Numo is working.
 *
 * This provider also carries what must survive the disassembly of the view: the
 * SCOPE of the conversation, and the resumption of the open conversation.
 *
 * Both have been read elsewhere than here since MIN-353. The scope is that of the
 * CONVERSATION, not the URL — it's [assistant-scope.ts](assistant-scope.ts)
 * that slices it, and that's what makes a navigation no longer throw the thread in progress. The open conversation is a fact of SERVEUR
 * (`/api/assistant/active-conversation`) and no longer a localStorage key:
 * it survives the reload, the next tab and the desktop app.
 */

type AssistantChatApi = ReturnType<typeof useAssistantChat>;

export interface AssistantChatContextValue extends AssistantChatApi {
  /** Living conversation scope: project id, or `null` = global. */
  scopeProjectId: string | null;
  /** Resumption of the open conversation, read on the server side. */
  restoring: boolean;
  /** Numo produces a round — client flow OR server-side generation. */
  isBusy: boolean;
  /**
 * An opening has imposed a scope that living conversation cannot carry
 *: a new thread will replace it. Read before sending the message
 * that such an opening carries — sent now, it would go into the departing conversation, and the server would refuse it (scope ≠ conversation).
 */
  scopeSwitchPending: boolean;
}

const AssistantChatContext = createContext<AssistantChatContextValue | null>(
  null,
);

/** The keys of the old localStorage pointer, one per scope. Purged at the
 * first restart: the pointer lives in the base from now on, and leaving them lying around
 * would one day make one believe in a source of truth which is no longer one. */
const LEGACY_STORAGE_PREFIX = "assistant-active-conv-";

function purgeLegacyStorage(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable (private browsing, quota) — nothing to purge.
  }
}

export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const { isOpen, pendingOptions, routeProjectId } = useAssistantPanel();
  const { refreshUser } = useAuth();
  const currentLocale = useLocale();
  const router = useRouter();

  // Numo can modify account settings on the server side (via the admin API),
  // which does not trigger any client auth event — we therefore reload the
  // account, and if it changed the language (a cookie, not user_metadata),
  // apply that change too.
  const { setTheme } = useTheme();
  const handleToolResult = useCallback(
    (name: string, success: boolean, result: unknown) => {
      if (!success || name !== "update_account_settings") return;
      void refreshUser();
      const nextLocale = (result as { settings?: { locale?: string } })
        ?.settings?.locale;
      if (nextLocale && nextLocale !== currentLocale) {
        void setLocaleCookie(nextLocale).then(() => router.refresh());
      }
      // The theme is saved on the account: adopt it immediately (the provider
      // write also refreshes the localStorage cache the pre-paint script and
      // the ThemeProvider read back).
      const nextTheme = (result as { settings?: { theme?: unknown } })
        ?.settings?.theme;
      if (isAccountTheme(nextTheme)) setTheme(nextTheme);
    },
    [refreshUser, currentLocale, router, setTheme],
  );

  const {
    state,
    sendMessage: sendMessageRaw,
    loadConversation: loadConversationRaw,
    reset: resetRaw,
    abort,
  } = useAssistantChat({ onToolResult: handleToolResult });

  /**
 * Has the user ALREADY chosen the conversation they want to see?
 *
 * An INTENTION, not a state reached — and that's the difference. Resume
 * reads this flag to not overwrite a choice made while its GET
 * was still flying. `state.conversationId` cannot play this role: it is worth
 * `null` both when nothing has happened and just after a “new
 * conversation”, and it remains `null` throughout the `loadConversation` of a
 * selection (the dispatch only arrives after reading the messages). In the
 * three cases the recovery believed the field was clear.
 */
  const userPickedRef = useRef(false);

  const loadConversation = useCallback(
    (conversationId: string, projectId: string | null) => {
      userPickedRef.current = true;
      return loadConversationRaw(conversationId, projectId);
    },
    [loadConversationRaw],
  );

  const reset = useCallback(() => {
    userPickedRef.current = true;
    resetRaw();
  }, [resetRaw]);

  // Sending also means choosing: the message opens a conversation, and the
  // recovery no longer has to impose another on top.
  const sendMessage = useCallback(
    (...args: Parameters<typeof sendMessageRaw>) => {
      userPickedRef.current = true;
      return sendMessageRaw(...args);
    },
    [sendMessageRaw],
  );

  const isBusy =
    state.status === "streaming" ||
    state.status === "executing_tool" ||
    state.status === "generating_server";

  // Scope IMPOSED by the opening, if there is one (`undefined` = follow the
  // road). It doesn't survive `clearPendingOptions()`, so it's only worth
  // for the gesture that carried it — this is exactly its validity period.
  const overrideProjectId = useMemo<string | null | undefined>(
    () =>
      pendingOptions && "projectId" in pendingOptions
        ? (pendingOptions.projectId ?? null)
        : undefined,
    [pendingOptions],
  );

  // Who decides the scope: the lively conversation, except opening which
  // imposes another. A navigation no longer moves it — that's the whole fix.
  const { scopeProjectId: scope, startsNewConversation } = useMemo(
    () =>
      resolveAssistantScope({
        conversationId: state.conversationId,
        conversationProjectId: state.conversationProjectId,
        routeProjectId,
        overrideProjectId,
        busy: isBusy,
      }),
    [
      state.conversationId,
      state.conversationProjectId,
      routeProjectId,
      overrideProjectId,
      isBusy,
    ],
  );

  // “Ask Numo” about something from ANOTHER project: the current thread does not
  // cannot accommodate it (the server refuses a message whose scope does not
  // does not correspond to the conversation), we open a new one in the right one. Never
  // in the middle of a turn: the seesaw waits until Numo has given up.
  useEffect(() => {
    if (startsNewConversation && !isBusy) reset();
  }, [startsNewConversation, isBusy, reset]);

  // Opening carrying a one-shot action (self-sent prompt, draft):
  // no resumption, she would chase the action and lose it. Read in a ref
  // because `clearPendingOptions()` resets the options to null right after.
  const skipRestoreRef = useRef(false);
  skipRestoreRef.current = Boolean(
    pendingOptions?.prompt || pendingOptions?.draft,
  );

  // The restart is only played ONE time per session, at the first opening of the
  // panel: the open conversation no longer depends on the page you are on
  // found, so there is no reason to replay it while browsing. And nothing at all
  // who never opens Numo — not even the query.
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const startedRef = useRef(false);
  /**
 * What the server carries, as far as we know. `undefined` = we don't know
 * yet. It is HE who avoids the two parasitic writes of the recovery:
 * re-write the pointer that we have just read, and above all DELETE the pointer at
 * first rendering, when `conversationId` is still `null`.
 */
  const serverPointerRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || startedRef.current) return;
    startedRef.current = true;
    purgeLegacyStorage();

    // One-shot opening: nothing to restart, and the server pointer remains this
    // that it is until the next send replaces it.
    if (skipRestoreRef.current) {
      serverPointerRef.current = null;
      setRestored(true);
      return;
    }

    let cancelled = false;
    setRestoring(true);
    void (async () => {
      try {
        const { conversationId, projectId } = await fetchActiveConversation();
        serverPointerRef.current = conversationId;
        // The user was able to choose while this GET was flying — selection in
        // history, “new conversation”, immediate sending. His choice
        // wins: we never recover it. `loadConversationRaw`, otherwise the
        // resume would declare itself as a choice.
        if (!cancelled && conversationId && !userPickedRef.current) {
          await loadConversationRaw(conversationId, projectId);
        }
      } catch {
        // Unreadable pointer (network): we start with an empty screen, the thread remains
        // reachable via history. The pointer will rewrite itself on the next send.
        serverPointerRef.current = null;
      }
      if (!cancelled) {
        setRestoring(false);
        setRestored(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, loadConversationRaw]);

  // Mirror the pointer to the server: open a conversation in writing,
  // starting a new one erases it. `restored` is in the dependencies so that
  // the mirror catches up with an open conversation DURING the restart.
  useEffect(() => {
    if (!restored) return;
    if (serverPointerRef.current === state.conversationId) return;
    serverPointerRef.current = state.conversationId;
    void setActiveConversation(state.conversationId);
  }, [restored, state.conversationId]);

  /**
 * The pointer read again WITHOUT opening the panel, for surfaces which must
 * know if there is a thread left to resume — the reception, which only displays its FAB
 * under this condition. The recovery above cannot tell them: it
 * only triggers on the first opening, and on the reception there was
 * none. One reading per session, on demand: who does not ask the question
 * does not pay for the request.
 */
  const [probedConversationId, setProbedConversationId] = useState<
    string | null
  >(null);
  const probeStartedRef = useRef(false);
  const probeActiveConversation = useCallback(() => {
    if (probeStartedRef.current) return;
    probeStartedRef.current = true;
    void fetchActiveConversation()
      .then(({ conversationId }) => setProbedConversationId(conversationId))
      .catch(() => {
        // Unreadable pointer (network): we stick to the live state, like the
        // reprise. Au pire un FAB en moins, jamais un fil perdu.
      });
  }, []);

  const resumable = hasResumableConversation({
    conversationId: state.conversationId,
    messageCount: state.messages.length,
    busy: isBusy,
    probedConversationId,
    restored,
  });

  const resumeValue = useMemo<AssistantResumeValue>(
    () => ({ hasConversation: resumable, probe: probeActiveConversation }),
    [resumable, probeActiveConversation],
  );

  const value = useMemo<AssistantChatContextValue>(
    () => ({
      state,
      sendMessage,
      loadConversation,
      reset,
      abort,
      scopeProjectId: scope,
      restoring,
      isBusy,
      scopeSwitchPending: startsNewConversation,
    }),
    [
      state,
      sendMessage,
      loadConversation,
      reset,
      abort,
      scope,
      restoring,
      isBusy,
      startsNewConversation,
    ],
  );

  return (
    <AssistantChatContext.Provider value={value}>
      <AssistantBusyContext.Provider value={isBusy}>
        <AssistantResumeContext.Provider value={resumeValue}>
          {children}
        </AssistantResumeContext.Provider>
      </AssistantBusyContext.Provider>
    </AssistantChatContext.Provider>
  );
}

/**
 * “Is Numo working?” ", and nothing else (MIN-323).
 *
 * A separate context because its only consumer is the FAB, which only needs
 * ONLY this boolean: subscribed to the complete context, it goes back to each
 * SSE token — `state` changes with each fragment of answer, so the value too.
 * A boolean only changes twice per turn.
 *
 * It only bites CLOSED panel: open panel, the FAB returns `null`. This is
 * precisely the case where the user is looking at something else.
 */
const AssistantBusyContext = createContext(false);

export function useAssistantBusy(): boolean {
  return useContext(AssistantBusyContext);
}

/**
 * “Is there a thread left to pick up?” ", and nothing else — a separate context for
 * the same reason as the previous one: its consumer only needs the boolean,
 * which only changes on both ends of a conversation, not on each token.
 *
 * `probe` requests reading of the server pointer, once per session. It lives
 * here rather than at the caller so that the two surfaces that would ask the question make only one request, and the answer arrives at the same place as the living state with which it combines
 * ([assistant-resumable.ts](assistant-resumable.ts)).
 */
interface AssistantResumeValue {
  hasConversation: boolean;
  probe: () => void;
}

const AssistantResumeContext = createContext<AssistantResumeValue>({
  hasConversation: false,
  probe: () => {},
});

/**
 * Is there a Numo conversation to reopen? Calling this hook DECLARE the need:
 * it triggers reading of the pointer on mount, and returns `false` as long as we don't know — the home prefers a FAB that appears to a FAB that goes out.
 */
export function useResumableConversation(): boolean {
  const { hasConversation, probe } = useContext(AssistantResumeContext);
  useEffect(() => {
    probe();
  }, [probe]);
  return hasConversation;
}

export function useAssistantChatContext(): AssistantChatContextValue {
  const ctx = useContext(AssistantChatContext);
  if (!ctx) {
    throw new Error(
      "useAssistantChatContext must be used within an AssistantChatProvider",
    );
  }
  return ctx;
}
