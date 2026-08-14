import type { AssistantToolCall } from "@/lib/assistant-types";
import type { AiFeature, AiUsageBillTo } from "@/lib/server/ai-usage-shape";

import type { AgentFileChangeStatus } from "@/lib/agent-api";

/**
 * LE VOCABULAIRE DU HARNESS, ET RIEN D'AUTRE (MIN-286).
 *
 * Ces types vivaient dans `agent-loop.ts`, avec la boucle maison. La boucle est
 * partie ; eux restent, parce qu'ils ne lui appartenaient pas : ce sont les mots
 * que se disent le superviseur d'opencode, le plan de contrôle, le fil et le
 * ledger. Un event, une ligne d'usage, une charge de direct, une étape de plan.
 *
 * Module SANS dépendance sortante — ni base, ni réseau, ni fournisseur. C'est ce
 * qui lui permet d'entrer dans le bundle de la microVM sans y faire entrer un
 * client Supabase avec lui (cf. `vm-bundle-secrets.test.ts`).
 */

/** Une partie de contenu, au format des content parts OpenAI/OpenRouter. */
export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * Une image renvoyée par un tool, prête à devenir une partie `image_url`.
 * `url` est une DATA URL (`data:image/png;base64,…`), jamais une URL signée :
 * elle est rejouée des heures plus tard, quand l'URL signée a expiré depuis
 * longtemps.
 */
export interface AgentToolImage {
  url: string;
  /** Nom du fichier — pour les traces et les events, jamais envoyé au modèle. */
  name?: string;
}

/**
 * Un fichier touché, annoncé au fil PENDANT le tour.
 *
 * Le `status` n'est CERTAIN que là où le tool le porte. Ailleurs on annonce
 * `modified`, et l'event `files_changed` de fin de tour, dérivé de
 * `git diff --name-status`, rectifie : le fil montre du PROVISOIRE en attendant
 * l'autorité.
 */
export type AgentLiveEdit = {
  path: string;
  status: AgentFileChangeStatus;
  previousPath?: string;
};

/**
 * Un message du protocole chat OpenRouter. `content` accepte un TABLEAU DE PARTIES
 * (texte + image, MIN-111) : c'est ce qui permet à une maquette jointe au ticket
 * d'arriver dans les yeux du modèle.
 *
 * Ne sert plus qu'à DEUX choses depuis la suppression de la boucle : l'amorce du
 * tour, que la fonction assemble avant d'en tirer le prompt d'opencode, et la
 * relecture des vieux checkpoints (`AgentCheckpoint.messages`), dont plus personne
 * ne sait rejouer la conversation — cf. `priorConversationLost` dans execute.ts.
 */
export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | AgentContentPart[] | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  name?: string;
}

export type AgentEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "commit"
  | "pr_opened"
  | "error"
  | "summary"
  | "user_message"
  | "plan_update"
  | "files_changed"
  | "question"
  /** Budget d'usage mensuel épuisé en cours de run : la session s'arrête et le fil
   *  affiche les issues possibles (monter de plan, attendre, passer en BYOK). */
  | "quota_exhausted";

export type EmitAgentEvent = (
  type: AgentEventType,
  payload: Record<string, unknown>,
) => Promise<void> | void;

/**
 * L'exécution d'un tool de domaine, telle que le pont la sert à opencode.
 *
 * `callId` RATTACHE ce que le tool engendre à sa ligne du fil : les events d'une
 * session fille portent le `parent_call_id` de la délégation qui l'a ouverte, et
 * le fil les replie dessous au lieu d'ouvrir une bulle par event.
 */
export type ExecuteAgentTool = (
  name: string,
  args: Record<string, unknown>,
  callId?: string,
) => Promise<{
  result: unknown;
  success: boolean;
  /** Étiquette d'échec, reportée telle quelle sur l'event `tool_result` : un refus
   *  du harness doit être COMPTABLE en base, pas seulement lisible dans le preview
   *  (cf. `forbidden_command` du garde-fou git, MIN-108). */
  reason?: string;
  /** Images à MONTRER au modèle (MIN-111) — les octets voyagent ici et JAMAIS dans
   *  `result` : celui-ci est sérialisé, capé et recopié dans l'event `tool_result`,
   *  où une data URL n'aurait rien à faire. */
  images?: AgentToolImage[];
  /**
   * Ce que le harness a de LONG à dire sur cet appel (MIN-247). Le `result` d'un
   * tool est élidé EN SON MILIEU au-delà d'un gabarit — parfait pour une sortie de
   * commande dont le verdict est en queue, ruineux pour un document qu'on donne à
   * LIRE EN ENTIER. Le seul usage à ce jour est la porte de `create_pr`, qui rend
   * le diff du tour : un diff amputé de son milieu ne se relit pas, et c'est
   * précisément la relecture qu'on essaie de faire avoir lieu.
   */
  followUp?: string;
}>;

/** État du round EN COURS d'écriture, poussé au fil ouvert (jamais persisté). */
export interface AgentLiveProgress {
  /** Réponse du modèle telle qu'écrite jusqu'ici (texte COMPLET, pas un delta). */
  text: string;
  /** Appels d'outils déjà amorcés dans ce round : >0 ⇒ le texte est de la
   *  narration, le tour continue. 0 ⇒ c'est peut-être la réponse finale. */
  tools: number;
  /**
   * Le modèle est EN TRAIN de raisonner (MIN-122) : le fil affiche un indicateur
   * compact + un compteur. Le TEXTE du raisonnement ne voyage pas ici — il n'est
   * pas streamé à l'écran, seulement persisté replié en fin de round.
   */
  reasoningActive: boolean;
  /** Millisecondes de réflexion accumulées dans ce round (0 si pas de raisonnement). */
  reasoningMs: number;
  /**
   * Fichiers touchés jusqu'ici par le tour, PROVISOIRES (MIN-248 bis) : ils sont
   * portés par chaque charge du direct, pas seulement par celle de l'édition —
   * une charge est un instantané complet, et ce qu'elle tait, le fil l'efface.
   * L'event `files_changed` de fin de tour, dérivé de git, prend le relais.
   */
  files?: AgentLiveEdit[];
  /** La liste a été bornée (`CHANGED_FILES_CAP`) : le fil le dit plutôt que de
   *  laisser lire une liste tronquée comme une liste complète. */
  filesTruncated?: boolean;
}

export type EmitAgentLive = (progress: AgentLiveProgress) => void;

/**
 * Une ligne de ledger, telle que le harness la produit — la MÊME forme
 * qu'`AiUsageInput`, redite ici pour que ce module ne dépende pas de celui qui
 * écrit (cf. l'en-tête).
 */
export interface AgentUsageLine {
  runId: string;
  seq: number;
  feature: AiFeature;
  billTo: AiUsageBillTo;
  model?: string | null;
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  /** Prompt caching (MIN-242) : tokens relus au cache, tokens écrits dedans. */
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  cost?: number | null;
  estimated?: boolean;
  projectId?: string | null;
}

/**
 * Où part une ligne de ledger. Injecté, et OBLIGATOIRE : c'est ce qui fait que le
 * harness ne connaît pas le chemin de la base (MIN-224). Deux implémentations —
 * `recordAiUsage` dans la fonction, `POST /api/agent-vm/usage` dans la microVM.
 *
 * Best-effort des deux côtés : elle ne doit jamais faire échouer un round.
 */
export type RecordAgentUsage = (line: AgentUsageLine) => Promise<void>;

export type PlanStepStatus = "pending" | "in_progress" | "completed" | "cancelled";
export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}

const PLAN_STATUSES = new Set<PlanStepStatus>(["pending", "in_progress", "completed", "cancelled"]);

/** Normalise l'argument `plan` du tool update_plan en étapes valides (borné). */
export function normalizePlan(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 40)
    .map((it) => {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const step = String(o.step ?? o.text ?? "").slice(0, 300);
      const s = String(o.status ?? "pending");
      const status = PLAN_STATUSES.has(s as PlanStepStatus) ? (s as PlanStepStatus) : "pending";
      return { step, status };
    })
    .filter((s) => s.step.trim().length > 0);
}

/**
 * Un tool de PLATEFORME, exécuté hors du dépôt : ticket, carnet, pull request,
 * scratchpad. Le pont de la microVM le sert par un POST vers le plan de contrôle,
 * qui le route par NOM et par ANCRAGE (`runPlatformTool`, MIN-326).
 */
export type PlatformToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{
  result: unknown;
  success: boolean;
  images?: AgentToolImage[];
  /** Ce que le harness a de LONG à dire sur cet appel — servi après le round, là
   *  où un `result` serait élidé par le milieu. Aujourd'hui : le contrôle du plan
   *  accroché à `write_issue_plan` (`gateWritePlan`). */
  followUp?: string;
}>;
