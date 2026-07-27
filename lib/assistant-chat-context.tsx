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
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useAuth } from "@/lib/auth-context";
import { setLocaleCookie } from "@/lib/set-locale";

/**
 * La conversation Numo VIT AU-DESSUS du panneau, pas dedans.
 *
 * Le Sheet de `AssistantPanel` démonte son contenu à la fermeture : tant que le
 * chat vivait dans `AssistantShell`, fermer le panneau pendant un tour jetait
 * l'état (le flux SSE continuait de dispatcher dans un reducer mort) et rouvrir
 * repartait d'une restauration. En hissant `useAssistantChat` ici, le tour
 * CONTINUE en fond, la coquille n'est plus qu'une vue, et le FAB peut afficher
 * son liseré tant que Numo travaille.
 *
 * Ce provider porte aussi ce qui doit survivre au démontage de la vue : la
 * PORTÉE de la conversation (global ou projet) et la restauration de la
 * dernière conversation de cette portée depuis localStorage.
 */

type AssistantChatApi = ReturnType<typeof useAssistantChat>;

export interface AssistantChatContextValue extends AssistantChatApi {
  /** Portée de la conversation vivante : id de projet, ou `null` = global. */
  scopeProjectId: string | null;
  /** Restauration de la dernière conversation de la portée en cours. */
  restoring: boolean;
  /** Numo produit un tour — flux client OU génération côté serveur. */
  isBusy: boolean;
}

const AssistantChatContext = createContext<AssistantChatContextValue | null>(
  null,
);

function storageKeyFor(scope: string | null): string {
  return `assistant-active-conv-${scope ?? "global"}`;
}

export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const { isOpen, pendingOptions, routeProjectId } = useAssistantPanel();
  const { refreshUser } = useAuth();
  const currentLocale = useLocale();
  const router = useRouter();

  // Numo peut modifier les réglages du compte côté serveur (via l'API admin),
  // ce qui ne déclenche aucun événement d'auth client — on recharge donc le
  // compte, et s'il a changé la langue (un cookie, pas du user_metadata) on
  // applique aussi ce changement.
  const handleToolResult = useCallback(
    (name: string, success: boolean, result: unknown) => {
      if (!success || name !== "update_account_settings") return;
      void refreshUser();
      const nextLocale = (result as { settings?: { locale?: string } })
        ?.settings?.locale;
      if (nextLocale && nextLocale !== currentLocale) {
        void setLocaleCookie(nextLocale).then(() => router.refresh());
      }
    },
    [refreshUser, currentLocale, router],
  );

  const { state, sendMessage, loadConversation, reset, abort } =
    useAssistantChat({ onToolResult: handleToolResult });

  const isBusy =
    state.status === "streaming" ||
    state.status === "executing_tool" ||
    state.status === "generating_server";

  // Portée VOULUE : un override explicite sur les options d'ouverture gagne,
  // sinon on suit l'URL.
  const desiredScope = useMemo<string | null>(() => {
    if (pendingOptions && "projectId" in pendingOptions) {
      return pendingOptions.projectId ?? null;
    }
    return routeProjectId;
  }, [pendingOptions, routeProjectId]);

  // Portée COMMISSIONNÉE : celle de la conversation vivante. Elle ne bouge que
  // quand le panneau est ouvert — le provider vit désormais pour toute la
  // session, et suivre l'URL en permanence relancerait une restauration à
  // chaque navigation, y compris chez qui n'ouvre jamais Numo.
  const [scope, setScope] = useState<string | null>(null);
  const [scopeReady, setScopeReady] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (scopeReady) {
      if (desiredScope === scope) return;
      // Un tour en cours n'est pas interrompu par une navigation : le
      // re-scope attend qu'il soit fini (cet effet rejoue quand isBusy tombe).
      if (isBusy) return;
    }
    setScope(desiredScope);
    setScopeReady(true);
  }, [isOpen, desiredScope, scope, scopeReady, isBusy]);

  // Ouverture porteuse d'une action one-shot (prompt auto-envoyé, brouillon) :
  // pas de restauration, elle courserait l'action et la perdrait. Lu dans un ref
  // parce que `clearPendingOptions()` remet les options à null juste après.
  const skipRestoreRef = useRef(false);
  skipRestoreRef.current = Boolean(
    pendingOptions?.prompt || pendingOptions?.draft,
  );

  // Portée dont la restauration a déjà été jouée (`undefined` = aucune encore).
  const restoredScopeRef = useRef<string | null | undefined>(undefined);
  // La persistance n'écrit qu'une fois la restauration finie, sinon le `null`
  // initial de conversationId effacerait l'id sauvegardé avant de le lire.
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!scopeReady) return;
    if (restoredScopeRef.current === scope) return;
    const isRescope = restoredScopeRef.current !== undefined;
    restoredScopeRef.current = scope;
    hasRestoredRef.current = false;

    // Changement de portée : la conversation précédente appartient à un autre
    // projet, on repart à zéro avant de restaurer celle de la nouvelle.
    if (isRescope) reset();

    if (skipRestoreRef.current) {
      hasRestoredRef.current = true;
      setRestoring(false);
      return;
    }

    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKeyFor(scope));
    } catch {
      // localStorage indisponible — pas de restauration.
    }
    if (!saved) {
      hasRestoredRef.current = true;
      setRestoring(false);
      return;
    }

    let cancelled = false;
    setRestoring(true);
    void (async () => {
      try {
        await loadConversation(saved);
      } catch {
        // Id périmé (conversation supprimée, inaccessible, réseau) — on le
        // jette pour ne pas réessayer une conversation cassée.
        try {
          window.localStorage.removeItem(storageKeyFor(scope));
        } catch {}
      }
      if (!cancelled) {
        hasRestoredRef.current = true;
        setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, scopeReady, reset, loadConversation]);

  // Miroir de conversationId vers localStorage, par portée.
  useEffect(() => {
    if (!hasRestoredRef.current) return;
    const key = storageKeyFor(scope);
    try {
      if (state.conversationId) {
        window.localStorage.setItem(key, state.conversationId);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Quota / navigation privée — on ignore.
    }
  }, [scope, state.conversationId]);

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
    ],
  );

  return (
    <AssistantChatContext.Provider value={value}>
      {children}
    </AssistantChatContext.Provider>
  );
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
