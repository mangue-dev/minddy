"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { AssistantPageContext } from "@/lib/assistant-types";
import { projectIdFromPath } from "@/lib/project-id-from-path";

export interface OpenAssistantOptions {
  /**
   * Override the project scope. `undefined` = follow the current route,
   * `null` = explicit global mode, `string` = explicit project id.
   */
  projectId?: string | null;
  /** Auto-send a one-shot message right after opening. */
  prompt?: string;
  /** Pre-fill the composer without sending (one-shot). */
  draft?: string;
  /**
   * What the user is currently looking at (e.g. the issue open in the side
   * panel). Sent with the conversation's messages so Numo can resolve
   * "ce ticket" and edit it directly. Persists for the opened session.
   */
  pageContext?: AssistantPageContext;
}

export interface AssistantPanelContextValue {
  isOpen: boolean;
  /** Options consumed by AssistantPanel on the next open cycle. */
  pendingOptions: OpenAssistantOptions | null;
  /**
   * Page context active for the open session (e.g. the issue being viewed).
   * Set on open, cleared on close — survives `clearPendingOptions` so manual
   * follow-up messages keep carrying it. Set in event handlers, so the panel
   * never has to setState inside an effect.
   */
  activePageContext: AssistantPageContext | null;
  /**
   * Ambient context derived from the page the user is currently on (e.g. the
   * issue whose side panel is open). Unlike `activePageContext`, it exists
   * independently of open/close — it drives the FAB badge (panel closed) and
   * is the default context attached to messages when the panel is opened
   * without an explicit one. Set declaratively via `useAssistantContext`.
   */
  ambientContext: AssistantPageContext | null;
  /**
   * Set/clear the ambient context. `ownerId` scopes ownership so a page
   * unmounting only clears the context if it still owns it — prevents a
   * navigation's unmount/mount race from wiping the next page's context.
   */
  setAmbientContext: (
    ctx: AssistantPageContext | null,
    ownerId: string,
  ) => void;
  open: (opts?: OpenAssistantOptions) => void;
  close: () => void;
  toggle: () => void;
  /** Called by the panel after consuming pendingOptions. */
  clearPendingOptions: () => void;
  /** Project id derived from the current URL when no override is provided. */
  routeProjectId: string | null;
}

const AssistantPanelContext = createContext<AssistantPanelContextValue | null>(
  null,
);

export function AssistantPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeProjectId = useMemo(
    () => projectIdFromPath(pathname ?? ""),
    [pathname],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [pendingOptions, setPendingOptions] =
    useState<OpenAssistantOptions | null>(null);
  const [activePageContext, setActivePageContext] =
    useState<AssistantPageContext | null>(null);
  const [ambientContext, setAmbientContextState] =
    useState<AssistantPageContext | null>(null);
  // Which mounted surface owns the current ambient context. Only the owner may
  // clear it, so navigating A→B (B mounts before A's cleanup runs) never wipes
  // B's freshly-set context.
  const ambientOwnerRef = useRef<string | null>(null);

  const setAmbientContext = useCallback(
    (ctx: AssistantPageContext | null, ownerId: string) => {
      if (ctx) {
        ambientOwnerRef.current = ownerId;
        setAmbientContextState(ctx);
      } else if (ambientOwnerRef.current === ownerId) {
        ambientOwnerRef.current = null;
        setAmbientContextState(null);
      }
    },
    [],
  );

  const open = useCallback((opts?: OpenAssistantOptions) => {
    setPendingOptions(opts ?? null);
    setActivePageContext(opts?.pageContext ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setActivePageContext(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setActivePageContext(null);
        return false;
      }
      // Toggle-open clears any stale pending options/context from a previous open.
      setPendingOptions(null);
      setActivePageContext(null);
      return true;
    });
  }, []);

  const clearPendingOptions = useCallback(() => {
    setPendingOptions(null);
  }, []);

  const value = useMemo<AssistantPanelContextValue>(
    () => ({
      isOpen,
      pendingOptions,
      activePageContext,
      ambientContext,
      setAmbientContext,
      open,
      close,
      toggle,
      clearPendingOptions,
      routeProjectId,
    }),
    [
      isOpen,
      pendingOptions,
      activePageContext,
      ambientContext,
      setAmbientContext,
      open,
      close,
      toggle,
      clearPendingOptions,
      routeProjectId,
    ],
  );

  return (
    <AssistantPanelContext.Provider value={value}>
      {children}
    </AssistantPanelContext.Provider>
  );
}

export function useAssistantPanel(): AssistantPanelContextValue {
  const ctx = useContext(AssistantPanelContext);
  if (!ctx) {
    throw new Error(
      "useAssistantPanel must be used within an AssistantPanelProvider",
    );
  }
  return ctx;
}

/**
 * Declaratively register the assistant's ambient context for the lifetime of a
 * component. Pass the context the current surface represents (e.g. the issue
 * open in the side panel), or `null` when there is none. The context is
 * published while mounted and cleared on unmount; it powers the FAB badge and
 * the chip above the composer, and rides on messages when the panel is opened
 * without an explicit context. Safe to call once per page/surface.
 */
export function useAssistantContext(
  context: AssistantPageContext | null,
): void {
  const { setAmbientContext } = useAssistantPanel();
  const ownerId = useId();
  // Serialize to a stable key so the effect re-publishes only on a real change
  // (the caller passes a fresh object each render). The object is rebuilt from
  // the key inside the effect — no ref reads during render.
  const contextKey = context ? JSON.stringify(context) : null;

  useEffect(() => {
    const next = contextKey
      ? (JSON.parse(contextKey) as AssistantPageContext)
      : null;
    setAmbientContext(next, ownerId);
    return () => setAmbientContext(null, ownerId);
  }, [contextKey, ownerId, setAmbientContext]);
}
