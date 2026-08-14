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
import { resolveAssistantScope } from "@/lib/assistant-scope";
import {
  fetchActiveConversation,
  setActiveConversation,
} from "@/lib/assistant-api";
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
 * PORTÉE de la conversation, et la reprise de la conversation ouverte.
 *
 * Les deux se lisent ailleurs qu'ici depuis MIN-353. La portée est celle de la
 * CONVERSATION, pas de l'URL — c'est [assistant-scope.ts](assistant-scope.ts)
 * qui la tranche, et c'est ce qui fait qu'une navigation ne jette plus le fil en
 * cours. La conversation ouverte, elle, est un fait de SERVEUR
 * (`/api/assistant/active-conversation`) et non plus une clé de localStorage :
 * elle survit au rechargement, à l'onglet d'à côté et à l'app de bureau.
 */

type AssistantChatApi = ReturnType<typeof useAssistantChat>;

export interface AssistantChatContextValue extends AssistantChatApi {
  /** Portée de la conversation vivante : id de projet, ou `null` = global. */
  scopeProjectId: string | null;
  /** Reprise de la conversation ouverte, lue côté serveur. */
  restoring: boolean;
  /** Numo produit un tour — flux client OU génération côté serveur. */
  isBusy: boolean;
  /**
   * Une ouverture a imposé une portée que la conversation vivante ne peut pas
   * porter : un fil neuf va la remplacer. À lire avant d'envoyer le message
   * qu'une telle ouverture transporte — expédié maintenant, il partirait dans la
   * conversation qui s'en va, et le serveur le refuserait (portée ≠ conversation).
   */
  scopeSwitchPending: boolean;
}

const AssistantChatContext = createContext<AssistantChatContextValue | null>(
  null,
);

/** Les clés de l'ancien pointeur localStorage, une par portée. Purgées à la
 *  première reprise : le pointeur vit en base désormais, et les laisser traîner
 *  ferait croire un jour à une source de vérité qui n'en est plus une. */
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
    // localStorage indisponible (navigation privée, quota) — rien à purger.
  }
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

  const {
    state,
    sendMessage: sendMessageRaw,
    loadConversation: loadConversationRaw,
    reset: resetRaw,
    abort,
  } = useAssistantChat({ onToolResult: handleToolResult });

  /**
   * L'utilisateur a-t-il DÉJÀ choisi la conversation qu'il veut voir ?
   *
   * Une INTENTION, pas un état rendu — et c'est toute la différence. La reprise
   * lit ce drapeau pour ne pas recouvrir un choix pris pendant que son GET
   * volait encore. `state.conversationId` ne peut pas jouer ce rôle : il vaut
   * `null` aussi bien quand rien ne s'est produit que juste après un « nouvelle
   * conversation », et il reste `null` pendant tout le `loadConversation` d'une
   * sélection (le dispatch n'arrive qu'après la lecture des messages). Dans les
   * trois cas la reprise croyait le champ libre.
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

  // Envoyer, c'est choisir aussi : le message ouvre une conversation, et la
  // reprise n'a plus à en imposer une autre par-dessus.
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

  // Portée IMPOSÉE par l'ouverture, s'il y en a une (`undefined` = suivre la
  // route). Elle ne survit pas à `clearPendingOptions()`, donc elle ne vaut que
  // pour le geste qui l'a portée — c'est exactement sa durée de validité.
  const overrideProjectId = useMemo<string | null | undefined>(
    () =>
      pendingOptions && "projectId" in pendingOptions
        ? (pendingOptions.projectId ?? null)
        : undefined,
    [pendingOptions],
  );

  // Qui décide de la portée : la conversation vivante, sauf ouverture qui en
  // impose une autre. Une navigation ne la déplace plus — c'est tout le fix.
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

  // « Demander à Numo » sur une chose d'un AUTRE projet : le fil en cours ne
  // peut pas l'accueillir (le serveur refuse un message dont la portée ne
  // correspond pas à la conversation), on en ouvre un neuf dans la bonne. Jamais
  // au milieu d'un tour : la bascule attend que Numo ait rendu la main.
  useEffect(() => {
    if (startsNewConversation && !isBusy) reset();
  }, [startsNewConversation, isBusy, reset]);

  // Ouverture porteuse d'une action one-shot (prompt auto-envoyé, brouillon) :
  // pas de reprise, elle courserait l'action et la perdrait. Lu dans un ref
  // parce que `clearPendingOptions()` remet les options à null juste après.
  const skipRestoreRef = useRef(false);
  skipRestoreRef.current = Boolean(
    pendingOptions?.prompt || pendingOptions?.draft,
  );

  // La reprise ne se joue qu'UNE fois par session, à la première ouverture du
  // panneau : la conversation ouverte ne dépend plus de la page où l'on se
  // trouve, donc rien ne justifie de la rejouer en naviguant. Et rien du tout
  // chez qui n'ouvre jamais Numo — pas même la requête.
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const startedRef = useRef(false);
  /**
   * Ce que le serveur porte, à notre connaissance. `undefined` = on ne le sait
   * pas encore. C'est LUI qui évite les deux écritures parasites de la reprise :
   * ré-écrire le pointeur qu'on vient de lire, et surtout EFFACER le pointeur au
   * premier rendu, quand `conversationId` est encore `null`.
   */
  const serverPointerRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isOpen || startedRef.current) return;
    startedRef.current = true;
    purgeLegacyStorage();

    // Ouverture one-shot : rien à reprendre, et le pointeur du serveur reste ce
    // qu'il est jusqu'à ce que l'envoi qui suit le remplace.
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
        // L'utilisateur a pu choisir pendant que ce GET volait — sélection dans
        // l'historique, « nouvelle conversation », envoi immédiat. Son choix
        // gagne : on ne le recouvre jamais. `loadConversationRaw`, sinon la
        // reprise se déclarerait elle-même comme un choix.
        if (!cancelled && conversationId && !userPickedRef.current) {
          await loadConversationRaw(conversationId, projectId);
        }
      } catch {
        // Pointeur illisible (réseau) : on repart d'un écran vide, le fil reste
        // joignable par l'historique. Le pointeur se réécrira au prochain envoi.
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

  // Miroir du pointeur vers le serveur : ouvrir une conversation l'écrit, en
  // commencer une neuve l'efface. `restored` est dans les dépendances pour que
  // le miroir rattrape une conversation ouverte PENDANT la reprise.
  useEffect(() => {
    if (!restored) return;
    if (serverPointerRef.current === state.conversationId) return;
    serverPointerRef.current = state.conversationId;
    void setActiveConversation(state.conversationId);
  }, [restored, state.conversationId]);

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
        {children}
      </AssistantBusyContext.Provider>
    </AssistantChatContext.Provider>
  );
}

/**
 * « Numo travaille-t-il ? », et rien d'autre (MIN-323).
 *
 * Un contexte séparé parce que son seul consommateur est le FAB, qui n'a besoin
 * QUE de ce booléen : abonné au contexte complet, il se re-rendait à chaque
 * token SSE — `state` change à chaque fragment de réponse, donc la value aussi.
 * Un booléen ne change, lui, que deux fois par tour.
 *
 * Ça ne mord que panneau FERMÉ : panneau ouvert, le FAB rend `null`. C'est
 * précisément le cas où l'utilisateur regarde autre chose.
 */
const AssistantBusyContext = createContext(false);

export function useAssistantBusy(): boolean {
  return useContext(AssistantBusyContext);
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
