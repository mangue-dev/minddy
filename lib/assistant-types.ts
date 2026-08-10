// ── Numo (AI assistant) shared types ─────────────────────────────────

export type ConversationStatus = "idle" | "generating" | "error";

export interface Conversation {
  id: string;
  project_id: string | null;
  user_id: string;
  title: string | null;
  status: ConversationStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /** Joined project name, present on list responses in global mode. */
  project?: { name: string } | null;
}

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls: AssistantToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  /** On user messages, `metadata.attachments` carries the files sent with the
      message (AttachmentInput[] shape) — chat files have no DB row. */
  metadata: Record<string, unknown>;
  /**
   * The page context the message was sent with (open issue, board onglet…),
   * persisted so the chat can render a context badge above the user bubble.
   * Only set on user messages sent from a contextual surface; null otherwise.
   */
  context?: AssistantPageContext | null;
  created_at: string;
}

// SSE events for streaming assistant responses
export type AssistantSSEEvent =
  | { type: "content_delta"; data: { delta: string } }
  | { type: "tool_call_start"; data: { id: string; name: string } }
  | {
      type: "tool_call_args_delta";
      data: { id: string; delta: string };
    }
  | {
      type: "tool_call_complete";
      data: { id: string; name: string; arguments: string };
    }
  | {
      type: "tool_result";
      data: {
        id: string;
        name: string;
        result: unknown;
        success: boolean;
      };
    }
  | { type: "message_complete"; data: { message_id: string } }
  | { type: "error"; data: { message: string } }
  | { type: "done"; data: Record<string, never> };

/**
 * Un élément de contexte choisi à la main (bouton @ du composer) : un ticket,
 * un projet ou un membre de l'équipe. Le libellé vient du client — il n'est là
 * que pour que Numo puisse nommer la chose sans re-résoudre son id.
 */
export interface AssistantPinnedContext {
  kind: "issue" | "project" | "member" | "objective" | "page";
  id: string;
  /** « MIN-42 », « minddy », « Clément » — ce qu'affiche la pilule. */
  label: string;
  /** Détail secondaire : titre du ticket, e-mail du membre. */
  detail?: string;
  /** Membres : la graine du portrait (public.user_avatars), qui n'est PAS
      toujours le user_id — la déduire afficherait un autre visage. */
  avatarSeed?: string;
  /** Objectifs : leur couleur — c'est elle que porte leur cible, ici comme
      partout ailleurs dans l'application. */
  color?: string | null;
}

/**
 * Une commande « / » choisie dans le menu slash du composer. L'id est canonique
 * (le libellé, lui, est localisé — « /create issue » / « /créer ticket ») :
 * c'est lui qui voyage dans la requête et se persiste sur `metadata.command`
 * du message utilisateur, où le serveur le déplie en instructions pour Numo.
 */
export type AssistantCommandId = "create-issue";

/**
 * Une mention « @ » écrite DANS le message (membre de l'équipe, projet, ticket
 * ou objectif), résolue au moment de la frappe. Persistée sur
 * `metadata.mentions` du message utilisateur : elle sert à re-rendre la pilule
 * dans la bulle, et à dire à Numo qui/quoi ce nom désigne exactement.
 */
export interface AssistantMention {
  type: "member" | "project" | "issue" | "objective" | "page";
  id: string;
  /** Le texte écrit après le « @ » dans le message. */
  label: string;
  /** Membres : la graine du portrait — voir AssistantPinnedContext.avatarSeed. */
  avatarSeed?: string;
  /** Objectifs : leur couleur — voir AssistantPinnedContext.color. */
  color?: string | null;
  /** Pages du wiki : leur émoji (MIN-273). */
  icon?: string | null;
}

/**
 * Structured "what the user is currently looking at" context, attached to a
 * chat request so Numo can resolve deictic references ("ce ticket", "cette
 * vue") to a concrete issue/board without guessing. Derived ambiently from
 * the page the user is on. Plain opens with no surface leave it undefined.
 * Client-set, server-validated.
 */
export interface AssistantPageContext {
  projectId?: string;
  /**
   * Contexte ÉPINGLÉ à la main depuis le composer (bouton @), par opposition
   * au reste de cet objet, déduit de la page. Il survit à la navigation : c'est
   * l'utilisateur qui l'a choisi, pas la page qui l'a publié.
   */
  pinned?: AssistantPinnedContext[];
  /** Legacy (pre views-v2): the board tab the message was sent from. No longer
      populated — kept so old persisted messages still render their badge. */
  onglet?: "my" | "all";
  /** The issue open in the side panel (or selected in triage), when any. */
  issueId?: string;
  /** Issues selected for a bulk assistant request. */
  issueIds?: string[];
  issueIdentifiers?: string[];
  issueTitles?: string[];
  /** Human identifier ("MIND-42") — used for the context badge. */
  issueIdentifier?: string;
  issueTitle?: string;
  /** The objective whose filtered board is displayed, when any. */
  objectiveId?: string;
  objectiveName?: string;
  /** Sa couleur — ce que porte sa cible sur la pilule de contexte. */
  objectiveColor?: string | null;
  /** The feedback post open in the team dashboard, when any (MIN-52). */
  feedbackId?: string;
  feedbackTitle?: string;
  /** The routine open in the Agents page's Routines tab, when any (MIN-185). */
  routineId?: string;
  routineTitle?: string;
  /** The pull request open on the Pull Requests page, when any (MIN-66). It maps
      to `issueId` above (the issue the code agent implemented). */
  prNumber?: number;
  prState?: string;
  /** Canonical agent run id backing the PR — what read_pull_request resolves. */
  prRunId?: string;
  /** The saved kanban view currently selected on the board, when any. */
  viewId?: string;
  viewName?: string;
  /** The cycle displayed in cycle mode (MIN-32), when any. */
  cycleId?: string;
  /** Human date-range label ("6–19 juil") — used for the context badge. */
  cycleLabel?: string;
  /**
   * La PAGE du wiki ouverte (MIN-273). Le titre voyage avec l'id pour que la
   * pilule le dise sans relire la page, et pour que Numo puisse la nommer avant
   * son premier appel de tool.
   */
  pageId?: string;
  pageTitle?: string;
  pageIcon?: string | null;
}

// Request body for chat endpoint
export interface AssistantChatRequest {
  conversationId?: string;
  projectId?: string;
  message: string;
  /**
   * What the user is currently viewing (open issue, board onglet, objective).
   * Injected into the system prompt so Numo can resolve "ce ticket" precisely.
   * Carried on the messages of the originating session.
   */
  pageContext?: AssistantPageContext;
  /**
   * Files already uploaded to the `attachments` bucket under `chat/{uid}/…`
   * (AttachmentInput[] shape) — validated server-side against that prefix and
   * persisted on the user message's metadata.
   */
  attachments?: Array<{
    storage_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
  /**
   * Les « @ » écrits dans le message (membres, projets), résolus côté client.
   * Persistés sur la métadonnée du message et donnés à Numo sous forme d'une
   * ligne de résolution nom → id.
   */
  mentions?: AssistantMention[];
  /**
   * La commande « / » posée en tête du message, quand il y en a une. Validée
   * serveur, persistée sur la métadonnée du message et dépliée en bloc
   * d'instructions accroché à ce message (même mécanique que les mentions).
   */
  command?: AssistantCommandId;
  /**
   * Le fuseau IANA du navigateur (MIN-185). Sans lui, « crée une routine tous
   * les lundis à 13 h » partirait en UTC sans que personne ne le sache — et se
   * découvrirait des semaines plus tard, à l'heure où la routine tourne. C'est
   * une donnée que seul le client connaît : le serveur ne peut pas la deviner.
   */
  timezone?: string;
}
