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
import type {
  AssistantCommandId,
  AssistantMention,
  AssistantPageContext,
} from "@/lib/assistant-types";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { trackEvent } from "@/lib/analytics";

export interface OpenAssistantOptions {
  /**
   * Override the project scope. `undefined` = follow the current route,
   * `null` = explicit global mode, `string` = explicit project id.
   */
  projectId?: string | null;
  /** Auto-send a one-shot message right after opening. */
  prompt?: string;
  /**
   * Ce que le « @ » et le « / » du composer d'origine ont posé dans `prompt`.
   * L'accueil ouvre son propre composer, mentions et commande comprises : sans
   * ces deux-là, le texte arriverait bien à Numo mais dépouillé de ce qu'il
   * désigne — une mention redevenue du texte, une commande sans effet.
   */
  mentions?: AssistantMention[];
  command?: AssistantCommandId;
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
  /**
   * Une surface affiche-t-elle déjà un composer épinglé en bas d'écran, là où
   * le FAB se pose ? Déclaré par la surface elle-même (`useSuppressAssistantFab`)
   * plutôt que déduit d'une liste de routes : sur une même route, une page peut
   * en montrer un ou non selon l'onglet ouvert.
   */
  fabSuppressed: boolean;
  /** `ownerId` compte les surfaces : plusieurs peuvent être montées à la fois. */
  setFabSuppressed: (suppressed: boolean, ownerId: string) => void;
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

  /**
   * Les surfaces qui masquent le FAB, par id. Un ENSEMBLE et non un booléen :
   * deux peuvent se chevaucher (une conversation d'agent en pleine page, une
   * autre dans une modale par-dessus), et la première à se démonter rendrait
   * le FAB alors que la seconde le recouvre encore.
   */
  const [fabOwners, setFabOwners] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setFabSuppressed = useCallback((suppressed: boolean, ownerId: string) => {
    setFabOwners((prev) => {
      if (suppressed === prev.has(ownerId)) return prev;
      const next = new Set(prev);
      if (suppressed) next.add(ownerId);
      else next.delete(ownerId);
      return next;
    });
  }, []);

  const open = useCallback((opts?: OpenAssistantOptions) => {
    // `prompt` = ouverture programmatique (home, action de ticket) ; sans lui
    // c'est un clic direct sur le panneau.
    trackEvent("assistant_opened", {
      source: opts?.prompt ? "home" : opts?.pageContext ? "issue" : "fab",
      has_page_context: !!opts?.pageContext,
      autosend: !!opts?.prompt,
    });
    setPendingOptions(opts ?? null);
    setActivePageContext(opts?.pageContext ?? null);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    trackEvent("assistant_closed", {});
    setIsOpen(false);
    setActivePageContext(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        trackEvent("assistant_closed", {});
        setActivePageContext(null);
        return false;
      }
      trackEvent("assistant_opened", { source: "shortcut", has_page_context: false, autosend: false });
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
      fabSuppressed: fabOwners.size > 0,
      setFabSuppressed,
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
      fabOwners,
      setFabSuppressed,
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

/**
 * Masque le FAB de Numo tant que ce composant est monté et `active`.
 *
 * À appeler depuis la surface qui porte un composer épinglé en bas d'écran : le
 * FAB s'y poserait dessus, souvent pile sur son bouton d'envoi. C'est la
 * surface qui sait, pas la route — la page Agents montre une conversation sous
 * son onglet Conversations et une simple liste sous son onglet Routines, à la
 * même URL.
 */
export function useSuppressAssistantFab(active = true): void {
  const { setFabSuppressed } = useAssistantPanel();
  const ownerId = useId();

  useEffect(() => {
    setFabSuppressed(active, ownerId);
    return () => setFabSuppressed(false, ownerId);
  }, [active, ownerId, setFabSuppressed]);
}
