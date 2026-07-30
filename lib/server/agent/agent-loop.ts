import "server-only";

import type { AssistantToolCall } from "@/lib/assistant-types";
import { parseAskUserQuestions } from "@/lib/ask-user";
import {
  recordAiUsage,
  parseOpenRouterUsage,
  OPENROUTER_USAGE_INCLUDE,
  type OpenRouterUsage,
  type NormalizedUsage,
} from "@/lib/server/ai-usage";
import {
  chatCompletionsUrl,
  getAgentProvider,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  reasoningRequestFields,
  reasoningMaxTokens,
  REASONING_REQUEST_KEYS,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import type { AgentToolDef } from "./tools";
import type { AgentContentPart, AgentToolImage } from "./content";
import { pruneToolOutputs, capHistoryImages, headTail, TOOL_RESULT_MAX_CHARS } from "./prune";
import { markSystemPromptCache } from "./caching";
import {
  estimateTokens,
  planCompaction,
  serializeForSummary,
  dropOldestRound,
  SUMMARIZE_INSTRUCTION,
  COMPACT_SUMMARY_PREFIX,
} from "./compact";
import {
  AGENT_COMPACT_TOKEN_THRESHOLD,
  AGENT_COMPACT_ABSOLUTE_MAX_TOKENS,
  AGENT_COMPACT_KEEP_RECENT_BYTES,
  AGENT_COMPACT_MIN_BUDGET_MS,
  AGENT_RUN_TIMEOUT_MS,
} from "@/lib/agent-models";
import {
  StreamError,
  isRetryableStatus,
  isContextLengthError,
  parseRetryAfterMs,
  backoffMs,
  sleep,
  MAX_STREAM_ATTEMPTS,
  MAX_RETRY_WAIT_MS,
  STREAM_IDLE_TIMEOUT_MS,
} from "./retry";

/**
 * Boucle agentique de l'agent de code (MIN-46) — le « cerveau ». Calquée sur
 * `lib/server/assistant/loop.ts` (processChat) : streaming OpenRouter,
 * accumulation des tool-calls par index, exécution, résultats re-injectés,
 * on reboucle. Différences clés :
 *  - SUSPEND au SOMMET de chaque round si on dépasse la soft-deadline du chunk
 *    (frontière sûre : les résultats du round précédent sont déjà dans messages,
 *    aucun appel en vol) → l'appelant persiste le checkpoint et reprend au chunk
 *    suivant (handoff multi-jobs Vercel, comme AutoKap).
 *  - pas de persistance assistant_messages : `messages` EST le checkpoint.
 *  - chaque appel → `recordAiUsage(feature:'agent_code', run_id)` ; chaque étape
 *    → `emit` vers agent_run_events (live view).
 *  - FIN DE TOUR NATURELLE : le tour se termine quand le modèle répond SANS
 *    tool-call — sa réponse texte est le message à l'utilisateur (`reply`). Un seul
 *    tool de contrôle peut aussi clore le tour : `ask_user` (MIN-86) — questions
 *    structurées émises en event `question`, la session repose jusqu'à la réponse
 *    (`finish` reste supprimé — modèle conversationnel).
 * Les tools « métier » (read_file/write_file/run_command/create_pr…) sont délégués
 * à `execTool` (fourni par execute.ts, qui détient le Sandbox).
 */

const MAX_ROUNDS_PER_CHUNK = 60;
/**
 * Garde-fou : relances du tour par le hook de fin de tour. DEUX, parce que le
 * hook porte maintenant deux préoccupations distinctes, chacune tirant au plus
 * une fois : les erreurs de typage (MIN-110) puis l'auto-relecture du diff
 * (self-review.ts). Le pire cas est donc « réponse → types → correction →
 * réponse → relecture → réponse », et le tour se termine quoi qu'il arrive.
 */
const MAX_TURN_END_REENTRIES = 2;
/** Garde-fou : nombre max de compactions par chunk (convergence normalement immédiate). */
const MAX_COMPACTIONS_PER_CHUNK = 3;
/** Garde-fou : nombre max d'élagages de round sur un 400 « contexte trop long » (par appel). */
const MAX_CONTEXT_TRIMS = 4;
/** Fraction du seuil de compaction à partir de laquelle on PRÉVIENT le modèle (MIN-113). */
const CONTEXT_WARNING_RATIO = 0.7;
/**
 * Préavis injecté avant l'appel quand le contexte approche du seuil. Le modèle ne
 * savait pas qu'on le compactait : il recevait un résumé préfixé au milieu de son
 * propre raisonnement, sans préavis. Là il peut conclure proprement.
 *
 * On ne lui donne PAS de tool `get_context_remaining` (le choix inverse de Codex,
 * et il est délibéré) : le harness connaît déjà `lastPromptTokens` à chaque round,
 * donc lui faire dépenser un tour pour demander un chiffre qu'on peut pousser est
 * un mauvais échange. Ne pas « corriger » ça en ajoutant le tool.
 */
const CONTEXT_WARNING_MESSAGE =
  "You are approaching the context limit for this session. Finish the step you are on and reply — do not start new exploration.";
/** Tools d'exploration sans effet de bord → parallélisables dans un même round. */
const READ_ONLY_TOOLS = new Set(["read_file", "list_dir", "glob", "grep", "read_issue", "read_attachment"]);

/**
 * Un message du protocole chat OpenRouter (identique à celui de processChat).
 * `content` accepte un TABLEAU DE PARTIES (texte + image, MIN-111) : c'est ce qui
 * permet à une maquette jointe au ticket d'arriver dans les yeux du modèle. Tout
 * le harness lit ce champ via les helpers de `content.ts`, jamais comme une chaîne.
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

export type ExecuteAgentTool = (
  name: string,
  args: Record<string, unknown>,
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
}

export type EmitAgentLive = (progress: AgentLiveProgress) => void;


export interface RunAgentLoopParams {
  /** Historique (system + user, ou rehydraté depuis le checkpoint). MUTÉ + renvoyé. */
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  model: string;
  apiKey: string;
  /** Base URL OpenAI-compatible du provider (sans /chat/completions). */
  baseUrl: string;
  /** Provider effectif (OpenRouter par défaut) — pilote headers/body. */
  provider?: AgentProviderId;
  /**
   * Niveau de raisonnement FIGÉ sur le run (MIN-122). Absent/`off` = aucun champ
   * envoyé. Appliqué aux appels du TOUR, jamais à la compaction (une summarization
   * mécanique n'a rien à réfléchir, le raisonnement n'y serait que du coût).
   */
  reasoningLevel?: ReasoningLevel;
  runId: string;
  userId?: string | null;
  projectId?: string | null;
  /** Budget du chunk courant, mesuré depuis l'entrée dans la boucle. */
  softDeadlineMs: number;
  /**
   * Budget d'usage RESTANT (USD) au moment d'entrer dans le chunk. La boucle
   * s'arrête à la frontière de round dès que le chunk l'a consommé. `undefined` =
   * pas de plafond (BYOK : l'utilisateur paie sa propre note).
   */
  budgetUsd?: number;
  /**
   * Fenêtre de contexte (tokens) du modèle, si connue → seuil de compaction =
   * 75 % de cette fenêtre. Absent = seuil par défaut `AGENT_COMPACT_TOKEN_THRESHOLD`.
   */
  contextWindow?: number | null;
  execTool: ExecuteAgentTool;
  /**
   * Draine les messages de steering en attente (file `agent_run_messages`).
   * Appelé au SOMMET de chaque round : les messages renvoyés sont injectés comme
   * messages `user` avant le prochain appel LLM → orientation à chaud + reprise
   * d'un `ask_user`. Optionnel (absent = pas de steering).
   */
  pullSteering?: () => Promise<string[]>;
  /**
   * Miroir best-effort des états du checklist (tool update_plan) vers le plan de
   * l'issue liée. Appelé après l'event `plan_update`, jamais bloquant (les erreurs
   * sont avalées). Absent = pas de synchro (ex. run hors issue).
   */
  syncPlan?: (steps: PlanStep[]) => Promise<void>;
  emit: EmitAgentEvent;
  /**
   * Direct : texte du round pendant que le modèle l'écrit. Appelé ~4 fois par
   * seconde, puis une dernière fois À VIDE quand les vrais events du round sont
   * posés (ils prennent le relais à l'écran). Synchrone et best-effort — la
   * boucle ne l'attend pas. Absent = pas de direct (le fil poll, comme avant).
   */
  emitLive?: EmitAgentLive;
  /** Index de départ des lignes ai_usage (ordre d'affichage). */
  usageSeqStart?: number;
  signal?: AbortSignal;
  /**
   * « Interrompre la réponse en cours » : polé à la frontière de round ET pendant
   * le stream LLM (via un timer). Si true, la boucle abandonne l'appel en cours et
   * renvoie `interrupted` — SANS ajouter le round partiel (checkpoint = dernier
   * round complet). L'exécuteur repasse alors la session au repos.
   */
  checkInterrupt?: () => Promise<boolean>;
  /**
   * Dernier mot du harness avant que le tour ne se termine (MIN-110). Appelé quand
   * le modèle répond SANS tool-call, avec le budget mural qui reste sur le chunk.
   * Renvoie un texte → il est injecté comme message `user` et le tour REPART ;
   * renvoie null → le tour se termine normalement. Sert au type-check de fin de
   * tour (`typeErrorsForTurn`) : une édition qui casse un type le dit avant que
   * l'agent ne dise « c'est fait ». Plafonné à `MAX_TURN_END_REENTRIES` relances
   * par chunk — un dépôt inréparable ne doit pas retenir le tour indéfiniment.
   */
  onTurnEnd?: (opts: { budgetMs: number }) => Promise<string | null>;
}

/** Interruption utilisateur de la réponse en cours — distincte d'une StreamError
 *  (non reprenable : on ne retente pas, on renvoie `interrupted`). */
export class InterruptedError extends Error {
  constructor() {
    super("interrupted");
    this.name = "InterruptedError";
  }
}

/** Fréquence de poll du drapeau d'interruption pendant un stream. */
const INTERRUPT_POLL_MS = 2000;

/**
 * Cadence de rediffusion du texte en cours d'écriture (`emitStream`). ~4 fois par
 * seconde : assez pour que le texte pousse sous les yeux, assez espacé pour que
 * chaque round coûte quelques dizaines de messages realtime, pas des milliers.
 */
const LIVE_FLUSH_MS = 250;

export interface AgentLoopResult {
  status: "completed" | "suspended" | "interrupted" | "error" | "budget_exhausted";
  messages: AgentChatMessage[];
  /** Réponse finale du tour (fin naturelle : le modèle s'arrête sans tool-call). */
  reply?: string;
  /** Le tour s'est terminé sur un ask_user : la session ATTEND la réponse de
   *  l'utilisateur (stampé `awaiting_input` → point jaune sur les surfaces). */
  askedUser?: boolean;
  /** Erreur LLM fatale (non reprenable) : renvoyée AVEC les messages pour que
   *  l'exécuteur persiste le checkpoint (pas de perte de contexte/steering). */
  errorMessage?: string;
  costUsd: number;
  usageSeqEnd: number;
  rounds: number;
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function previewResult(result: unknown): string {
  return cap(typeof result === "string" ? result : JSON.stringify(result), 400);
}

/**
 * Contenu d'un message `role:"tool"` : le JSON du résultat (capé par `headTail`)
 * et, quand le tool renvoie des images (MIN-111), une partie `image_url` par
 * image. Les octets de l'image ne traversent PAS `headTail` : il élide le milieu,
 * ce qui d'une data URL ferait une chaîne base64 tronquée — illisible pour le
 * modèle, et non détectable autrement qu'à l'erreur du provider.
 */
function toolMessageContent(
  result: unknown,
  images?: AgentToolImage[],
): string | AgentContentPart[] {
  const text = headTail(JSON.stringify(result), TOOL_RESULT_MAX_CHARS);
  if (!images?.length) return text;
  return [
    { type: "text", text },
    ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.url } })),
  ];
}

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

/** Résumé compact des args d'un tool pour le live view (jamais le contenu de fichier). */
function toolArgSummary(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
    case "edit_file":
    case "delete_file":
      return { path: String(args.path ?? "") };
    case "move_file":
      return { from: String(args.from ?? ""), to: String(args.to ?? "") };
    case "apply_edits": {
      // Les chemins servent la vue LIVE « fichiers changés » (bloc de diff par tour,
      // MIN-46) : sans eux, un batch multi-fichiers n'apparaît que comme un compteur.
      const changes = Array.isArray(args.changes) ? args.changes : [];
      return {
        count: changes.length,
        paths: changes
          .map((c) => String((c as Record<string, unknown>)?.path ?? ""))
          .filter(Boolean)
          .slice(0, 50),
      };
    }
    case "apply_patch": {
      // Un patch est UNE grosse chaîne : on n'en garde que les en-têtes de section,
      // pour la même raison que les chemins d'`apply_edits` — sans eux, la vue live
      // « fichiers changés » est aveugle sur les runs `gpt-*` (MIN-115). Lecture
      // par regex, jamais un parse : un patch malformé ne doit pas casser l'event.
      const paths = [...String(args.patch ?? "").matchAll(/^\*\*\* (?:Add|Update|Delete) File:(.*)$/gm)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      return { count: paths.length, paths: paths.slice(0, 50) };
    }
    // `path` et `glob` font partie de ce QU'EST la recherche : sans eux, un
    // « (no matches) » dû à une portée trop étroite est indiscernable d'une vraie
    // absence — c'est ce qui a caché le bug d'accolades des pathspecs (MIN-116).
    case "glob":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
      };
    case "grep":
      return {
        pattern: String(args.pattern ?? ""),
        ...(args.path ? { path: String(args.path) } : {}),
        ...(args.glob ? { glob: String(args.glob) } : {}),
        ...(args.fixed_strings === true ? { fixed_strings: true } : {}),
      };
    case "run_command":
      // `workdir` fait partie de ce QU'EST la commande : sans lui, un `pnpm test`
      // lancé dans un sous-dossier est indiscernable du même lancé à la racine —
      // dans la vue live comme dans `agent_run_events` (MIN-109).
      return {
        command: cap(String(args.command ?? ""), 100),
        ...(args.workdir ? { workdir: String(args.workdir) } : {}),
      };
    case "run_background":
      // L'action ET sa cible : « check bg-2 » et « start npm run dev » ne racontent
      // pas la même chose dans la vue live ni dans `agent_run_events`.
      return {
        action: String(args.action ?? ""),
        ...(args.command ? { command: cap(String(args.command), 100) } : {}),
        ...(args.job_id ? { job_id: String(args.job_id) } : {}),
      };
    case "create_pr":
      return { title: cap(String(args.title ?? ""), 200) };
    case "read_attachment":
      return { attachment_id: String(args.attachment_id ?? "") };
    case "write_issue_plan":
      return { chars: String(args.plan ?? "").length };
    default:
      return {};
  }
}

interface StreamChunk {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  choices?: Array<{
    delta?: {
      content?: string;
      // Trace de raisonnement (selon provider). Affichée en live, jamais persistée.
      reasoning?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

interface StreamResult {
  content: string;
  /** Trace de raisonnement streamée (non round-trippée en chat-completions). */
  reasoning: string;
  /** Durée de la phase de réflexion : du premier delta de raisonnement au premier
   *  delta de réponse ou de tool-call. 0 = le modèle n'a pas raisonné (MIN-122). */
  reasoningMs: number;
  toolCalls: AssistantToolCall[];
  generationId: string | null;
  modelUsed: string | null;
  usage: NormalizedUsage;
}

/**
 * UN essai de complétion streamée (endpoint OpenAI-compatible). Accumule contenu,
 * tool-calls et usage. Le corps/headers sont ajustés au provider via son
 * `requestProfile`. Deux timers d'annulation : un timeout DUR (`AGENT_RUN_TIMEOUT_MS`)
 * et un timeout d'INACTIVITÉ réarmé à chaque octet SSE (stream figé). Lève une
 * `StreamError` (retryable ou non) que le wrapper `streamCompletion` gère.
 *
 * `onProgress` reçoit l'état accumulé pendant l'écriture (throttlé à
 * `LIVE_FLUSH_MS`) : c'est lui qui alimente le direct du fil. Il repart de zéro à
 * chaque essai — une reprise réécrit donc le texte plutôt que de le compléter.
 */
async function streamCompletionOnce(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: AgentProviderId;
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  signal?: AbortSignal;
  checkInterrupt?: () => Promise<boolean>;
  onProgress?: EmitAgentLive;
  /** Niveau de raisonnement à demander (MIN-122). Absent/`off` = rien d'envoyé. */
  reasoningLevel?: ReasoningLevel;
}): Promise<StreamResult> {
  const profile = getAgentProvider(opts.provider)?.requestProfile ?? {};

  const requestBody: Record<string, unknown> = {
    model: opts.model,
    // Prompt caching : marque le système d'un cache breakpoint pour les providers
    // qui l'acceptent (OpenRouter). Transient — l'historique reste en content:string.
    messages: profile.promptCaching ? markSystemPromptCache(opts.messages) : opts.messages,
    stream: true,
  };
  if (profile.streamUsage) requestBody.stream_options = { include_usage: true };
  if (profile.usageAccounting) requestBody.usage = OPENROUTER_USAGE_INCLUDE;
  // Raisonnement (MIN-122) : rien tant que le niveau est `off` ou que le provider
  // n'a pas déclaré sa forme au registre. Les tokens de réflexion sont comptés
  // DANS `max_tokens` par les couches compat → on relève le plafond en même temps,
  // sinon à `high` la réflexion tronque la réponse ET les tool-calls du round.
  Object.assign(requestBody, reasoningRequestFields(opts.reasoningLevel, opts.provider));
  const maxTokens = reasoningMaxTokens(profile.maxTokens, opts.reasoningLevel);
  if (maxTokens) requestBody.max_tokens = maxTokens;
  if (opts.tools.length > 0) requestBody.tools = opts.tools;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  if (profile.attribution) {
    headers["HTTP-Referer"] = "https://minddy.app";
    headers["X-Title"] = "Numo agent (minddy)";
  }
  if (profile.anthropicVersion) headers["anthropic-version"] = "2023-06-01";

  // Timers d'annulation. `timedOut` distingue un abort « nous » (reprenable) d'un
  // abort externe (annulation utilisateur → non reprenable).
  const controller = new AbortController();
  let timedOut = false;
  const abortTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const hardTimer = setTimeout(abortTimeout, AGENT_RUN_TIMEOUT_MS);
  let idleTimer = setTimeout(abortTimeout, STREAM_IDLE_TIMEOUT_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abortTimeout, STREAM_IDLE_TIMEOUT_MS);
  };
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  // Interruption utilisateur (« Stop ») : polée en tâche de fond pendant le stream.
  // Dès qu'elle est demandée, on abort le fetch → l'erreur est reconnue comme une
  // InterruptedError (non reprenable). Distinct des timeouts (reprenables).
  let interrupted = false;
  const interruptTimer = opts.checkInterrupt
    ? setInterval(() => {
        void opts
          .checkInterrupt!()
          .then((yes) => {
            if (yes) {
              interrupted = true;
              controller.abort();
            }
          })
          .catch(() => {});
      }, INTERRUPT_POLL_MS)
    : undefined;

  try {
    let response: Response;
    try {
      response = await fetch(chatCompletionsUrl(opts.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      if (interrupted) throw new InterruptedError();
      // Abort (timeout nous → reprenable ; externe → non) ou erreur réseau (reprenable).
      const retryable = timedOut || !opts.signal?.aborted;
      throw new StreamError(`network error: ${(err as Error).message}`, { retryable });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new StreamError(`LLM error (${response.status}): ${errorText.slice(0, 300)}`, {
        retryable: isRetryableStatus(response.status),
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"), Date.now()) ?? undefined,
      });
    }

    const reader = response.body?.getReader();
    if (!reader) throw new StreamError("No response body from LLM", { retryable: true });

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    let generationId: string | null = null;
    let modelUsed: string | null = null;
    let usageRaw: OpenRouterUsage | null = null;
    const acc = new Map<number, { id: string; name: string; arguments: string }>();

    // Chrono de la phase de réflexion (MIN-122) : ouvert au premier delta de
    // raisonnement, CLOS au premier delta de réponse ou de tool-call — c'est le
    // moment où le modèle passe de « il réfléchit » à « il écrit ». `reasoningMs`
    // accumule, pour qu'un modèle qui alterne réflexion et écriture compte juste.
    let reasoningMs = 0;
    let reasoningStartedAt: number | null = null;
    const openReasoning = () => {
      if (reasoningStartedAt === null) reasoningStartedAt = Date.now();
    };
    const closeReasoning = () => {
      if (reasoningStartedAt === null) return;
      reasoningMs += Date.now() - reasoningStartedAt;
      reasoningStartedAt = null;
    };
    /** Total à l'instant t, phase ouverte comprise (le compteur doit avancer). */
    const reasoningElapsed = () =>
      reasoningMs + (reasoningStartedAt === null ? 0 : Date.now() - reasoningStartedAt);

    // Direct : on republie l'état accumulé au plus une fois par `LIVE_FLUSH_MS`,
    // et seulement s'il a bougé depuis le dernier envoi. Pendant une phase de pure
    // réflexion RIEN ne bouge (ni texte ni tools) : c'est le chrono qui tient le
    // flux en vie, sans quoi l'indicateur s'afficherait puis se figerait.
    let lastFlushAt = 0;
    let lastFlushLen = -1;
    const flushProgress = (force = false) => {
      if (!opts.onProgress) return;
      const thinking = reasoningStartedAt !== null;
      const len = content.length + reasoning.length + acc.size;
      const moved = len !== lastFlushLen || thinking;
      if (!force && (!moved || Date.now() - lastFlushAt < LIVE_FLUSH_MS)) return;
      lastFlushAt = Date.now();
      lastFlushLen = len;
      opts.onProgress({
        text: content,
        tools: acc.size,
        reasoningActive: thinking,
        reasoningMs: reasoningElapsed(),
      });
    };

    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (interrupted) throw new InterruptedError();
        throw new StreamError(`stream interrupted: ${(err as Error).message}`, {
          retryable: timedOut || !opts.signal?.aborted,
        });
      }
      if (chunk.done) break;
      resetIdle();
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        let parsed: StreamChunk;
        try {
          parsed = JSON.parse(data) as StreamChunk;
        } catch {
          continue;
        }
        if (parsed.id && !generationId) generationId = parsed.id;
        if (parsed.model) modelUsed = parsed.model;
        if (parsed.usage) usageRaw = parsed.usage;
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          closeReasoning();
          content += delta.content;
        }
        if (delta.reasoning || delta.reasoning_content) {
          openReasoning();
          reasoning += delta.reasoning ?? "";
          reasoning += delta.reasoning_content ?? "";
        }
        if (delta.tool_calls) {
          closeReasoning();
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!acc.has(idx)) {
              acc.set(idx, { id: tc.id || "", name: tc.function?.name || "", arguments: "" });
            }
            const a = acc.get(idx)!;
            if (tc.id) a.id = tc.id;
            if (tc.function?.name) a.name = tc.function.name;
            if (tc.function?.arguments) a.arguments += tc.function.arguments;
          }
        }
      }
      flushProgress();
    }
    // Fin du flux : une phase de réflexion encore ouverte (le modèle a raisonné
    // puis rendu la main sans écrire) se clôt ici, sinon sa durée serait perdue.
    closeReasoning();
    // Dernier état de l'essai : sans ça, la fin du texte (écrite entre le dernier
    // flush et la fermeture du flux) n'apparaîtrait qu'une fois l'event posé.
    flushProgress(true);

    const toolCalls: AssistantToolCall[] = [...acc.values()].map((a) => ({
      id: a.id,
      type: "function",
      function: { name: a.name, arguments: a.arguments },
    }));

    // Le stream s'est terminé proprement mais une interruption a pu être demandée
    // à la toute fin (abort sans erreur de lecture) → on la fait remonter.
    if (interrupted) throw new InterruptedError();

    return {
      content,
      reasoning,
      reasoningMs,
      toolCalls,
      generationId,
      modelUsed,
      usage: parseOpenRouterUsage(usageRaw),
    };
  } finally {
    clearTimeout(hardTimer);
    clearTimeout(idleTimer);
    if (interruptTimer) clearInterval(interruptTimer);
  }
}

/**
 * Endpoints dont on a CONSTATÉ qu'ils rejettent le champ de raisonnement (MIN-122),
 * clés `provider:model`. Les couches compat documentent qu'elles ignorent les
 * champs inconnus, mais « ignoré » et « rejeté » ne se distinguent qu'à
 * l'exécution (cas connu : OpenAI + modèle non raisonneur type `gpt-4o`). On le
 * découvre une fois, on le mémorise pour le process — comme `orModelIndex` dans
 * model.ts. Un cold start réapprend, ce qui coûte un aller-retour, pas un run.
 */
const reasoningRefused = new Set<string>();

/** Le 400 vient-il du champ de raisonnement qu'on a envoyé ? */
function isReasoningRejection(err: unknown): boolean {
  if (!(err instanceof StreamError) || err.status !== 400) return false;
  const message = err.message.toLowerCase();
  return REASONING_REQUEST_KEYS.some((key) => message.includes(key));
}

/**
 * Complétion streamée avec REPRISES : retente les erreurs reprenables (429, 5xx,
 * réseau, stream figé) avec backoff (Retry-After sinon exponentiel + jitter).
 * Après épuisement, relève la `StreamError` (l'appelant décide : suspendre le run
 * plutôt qu'échouer si elle est reprenable).
 *
 * Cas à part : un 400 qui cite le champ de raisonnement. Il n'est pas reprenable
 * au sens du backoff (le retenter à l'identique redonnera le même 400) mais il est
 * RÉPARABLE — on relance UNE fois sans le champ, et on retient l'endpoint. Un
 * provider qui refuse le raisonnement ne doit pas tuer le run.
 */
async function streamCompletion(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: AgentProviderId;
  messages: AgentChatMessage[];
  tools: AgentToolDef[];
  signal?: AbortSignal;
  checkInterrupt?: () => Promise<boolean>;
  onProgress?: EmitAgentLive;
  reasoningLevel?: ReasoningLevel;
  /** Signale au fil que ce couple provider/modèle ne sait pas raisonner. */
  onReasoningUnsupported?: () => void;
  /** Deadline absolue (Date.now() ms) du chunk : au-delà, on ne dort pas, on relève. */
  deadlineAt?: number;
}): Promise<StreamResult> {
  // Endpoint déjà connu comme réfractaire : on n'y repasse pas par le 400.
  const endpointKey = `${opts.provider}:${opts.model}`;
  let attemptOpts = reasoningRefused.has(endpointKey)
    ? { ...opts, reasoningLevel: undefined }
    : opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_STREAM_ATTEMPTS; attempt++) {
    try {
      return await streamCompletionOnce(attemptOpts);
    } catch (err) {
      lastErr = err;
      // Interruption utilisateur : jamais retentée — on la fait remonter.
      if (err instanceof InterruptedError) throw err;
      // Le provider refuse le champ de raisonnement : on le retire et on relance
      // le MÊME appel. L'échec n'étant pas transitoire, la relance ne consomme PAS
      // d'essai — sinon un endpoint réfractaire mangerait le budget de reprise des
      // vraies erreurs réseau. Ne peut se produire qu'une fois (le champ a disparu).
      if (attemptOpts.reasoningLevel && isReasoningRejection(err)) {
        reasoningRefused.add(endpointKey);
        opts.onReasoningUnsupported?.();
        attemptOpts = { ...opts, reasoningLevel: undefined };
        attempt--;
        continue;
      }
      const retryable = err instanceof StreamError ? err.retryable : true;
      if (!retryable || attempt === MAX_STREAM_ATTEMPTS - 1) throw err;
      // Attente plafonnée (un Retry-After absurde ne doit pas nous faire dormir au-
      // delà de maxDuration) ET budget-aware : si dormir puis retenter dépasse la
      // deadline du chunk, on relève → l'appelant suspend (reprise, fonction fraîche).
      const wait = Math.min(
        (err instanceof StreamError ? err.retryAfterMs : undefined) ?? backoffMs(attempt),
        MAX_RETRY_WAIT_MS,
      );
      if (opts.deadlineAt && Date.now() + wait >= opts.deadlineAt) throw err;
      await sleep(wait);
    }
  }
  throw lastErr;
}

/**
 * Fait tourner l'agent jusqu'à : fin de tour (réponse texte sans tool-call),
 * suspendu (soft-deadline / plafond de rounds), interrompu, ou erreur LLM.
 * Renvoie le checkpoint (`messages`) à persister, le coût du chunk et l'issue.
 */
export async function runAgentLoop(params: RunAgentLoopParams): Promise<AgentLoopResult> {
  const { messages, tools, model, apiKey, baseUrl, runId, execTool, emit } = params;
  const provider = params.provider ?? DEFAULT_AGENT_PROVIDER;
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  // Direct : `emitLive` pendant l'écriture, puis À VIDE dès que les events du
  // round sont posés — le fil bascule alors du texte provisoire aux vrais
  // messages, sans que les deux se superposent une seconde.
  const clearLive = () =>
    params.emitLive?.({ text: "", tools: 0, reasoningActive: false, reasoningMs: 0 });

  let seq = params.usageSeqStart ?? 0;
  let costUsd = 0;
  let round = 0;
  let compactions = 0;
  // Relances de fin de tour déjà consommées (MIN-110) : la première sert à faire
  // corriger, le check suivant vérifie le correctif — puis le tour se termine,
  // erreurs restantes ou non. Compté par CHUNK, comme les compactions.
  let turnEndReentries = 0;
  // Seuil de compaction : 75 % de la fenêtre du modèle si connue, sinon défaut —
  // mais TOUJOURS borné par le plafond absolu. Une fenêtre de 1 M donnerait sinon
  // un seuil de ~787 000 tokens, que nos runs n'atteignent jamais : c'est ce qui
  // a fait que la compaction n'a jamais tourné (MIN-113). Ce qui plafonne une
  // session longue est le coût par round, pas la fenêtre.
  const compactThreshold = Math.min(
    params.contextWindow
      ? Math.floor(params.contextWindow * 0.75)
      : AGENT_COMPACT_TOKEN_THRESHOLD,
    AGENT_COMPACT_ABSOLUTE_MAX_TOKENS,
  );
  // Taille de contexte réelle du dernier appel (prompt_tokens rapportés) — plus
  // fiable que l'estimation caractères/4 pour décider de compacter.
  let lastPromptTokens: number | null = null;
  // Préavis de fin de contexte déjà donné sur ce chunk ? Une seule fois — répéter
  // le message à chaque round harcèlerait le modèle sans rien lui apprendre.
  let contextWarned = false;

  for (;;) {
    // Interruption demandée entre deux rounds → repos, SANS round partiel (le
    // checkpoint reste au dernier round complet).
    if (params.checkInterrupt && (await params.checkInterrupt())) {
      return { status: "interrupted", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    // Frontière sûre : suspend AVANT le prochain appel LLM.
    if (elapsed() >= params.softDeadlineMs || round >= MAX_ROUNDS_PER_CHUNK) {
      return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    // Budget d'usage épuisé (quota minddy) — MÊME frontière, même raison : on ne
    // paie pas un appel de plus. `budgetUsd` est le restant SNAPSHOTÉ à l'entrée du
    // chunk, et `costUsd` ce que ce chunk a déjà dépensé : la comparaison est donc
    // exacte sans relire l'usage à chaque round. Le round en cours peut dépasser
    // légèrement (on ne coupe jamais un appel en vol) — c'est la politique assumée
    // de lib/server/usage.ts, comme chez Claude/ChatGPT.
    if (params.budgetUsd !== undefined && costUsd >= params.budgetUsd) {
      clearLive();
      return { status: "budget_exhausted", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    round++;

    // Steering : draine les messages user en attente et les injecte comme messages
    // `user` AVANT le prochain appel (frontière sûre, aucun appel en vol). Sert à
    // orienter un run en cours ET à répondre à un `ask_user` (reprise du run).
    if (params.pullSteering) {
      const injected = await params.pullSteering();
      for (const text of injected) {
        if (!text.trim()) continue;
        messages.push({ role: "user", content: text });
        await emit("user_message", { text: cap(text, 4000) });
      }
    }

    // Durcissement : élague les sorties de tools périmées (protège les ~40 Ko
    // récents). Réduit le coût par appel et la taille du checkpoint. No-op tant
    // qu'il n'y a pas ≥20 Ko à récupérer → sans effet sur les runs courts.
    pruneToolOutputs(messages);

    // Même hygiène pour les IMAGES (MIN-111) : on garde les plus récentes et on
    // remplace les plus anciennes par une note re-demandable. Une maquette pèse en
    // data URL bien plus que ce qu'elle coûte en tokens — sans ce plafond, c'est le
    // CHECKPOINT (8 Mo) qu'elle finirait par remplir, pas la fenêtre du modèle.
    capHistoryImages(messages);

    // Compaction : si l'historique reste énorme après élagage et qu'il reste du
    // budget, résume le milieu périmé en un message unique (préserve système +
    // queue récente). Rare — ne se déclenche que sur les runs très longs.
    if (
      compactions < MAX_COMPACTIONS_PER_CHUNK &&
      params.softDeadlineMs - elapsed() > AGENT_COMPACT_MIN_BUDGET_MS &&
      (lastPromptTokens ?? estimateTokens(messages)) >= compactThreshold
    ) {
      const plan = planCompaction(messages, { keepRecentBytes: AGENT_COMPACT_KEEP_RECENT_BYTES });
      if (plan) {
        // Compte la TENTATIVE (pas seulement le succès) : un résumé vide ne doit pas
        // relancer un sous-appel LLM payant à chaque round sans plafond.
        compactions++;
        const tokensBefore = estimateTokens(messages);
        try {
          const summaryStream = await streamCompletion({
            apiKey,
            model,
            baseUrl,
            provider,
            messages: [
              { role: "system", content: SUMMARIZE_INSTRUCTION },
              { role: "user", content: serializeForSummary(plan.toSummarize) },
            ],
            tools: [],
            signal: params.signal,
            deadlineAt: startedAt + params.softDeadlineMs,
          });
          await recordAiUsage({
            runId,
            seq: seq++,
            feature: "agent_code",
            model: summaryStream.modelUsed ?? model,
            generationId: summaryStream.generationId,
            promptTokens: summaryStream.usage.promptTokens,
            completionTokens: summaryStream.usage.completionTokens,
            totalTokens: summaryStream.usage.totalTokens,
            cost: summaryStream.usage.cost,
            userId: params.userId ?? null,
            projectId: params.projectId ?? null,
          });
          costUsd += summaryStream.usage.cost ?? 0;

          const summaryText = summaryStream.content.trim();
          if (summaryText) {
            const summaryMsg: AgentChatMessage = {
              role: "user",
              content: `${COMPACT_SUMMARY_PREFIX}\n\n${summaryText}`,
            };
            const rebuilt: AgentChatMessage[] = [...plan.seedPrefix, summaryMsg, ...plan.tail];
            messages.splice(0, messages.length, ...rebuilt);
            lastPromptTokens = null; // contexte réduit → recalculé au prochain appel
            await emit("status", {
              phase: "compacted",
              tokensBefore,
              tokensAfter: estimateTokens(messages),
            });
          }
        } catch {
          // Compaction best-effort : si le sous-appel de résumé échoue, on continue
          // sans compacter ce round (la tentative est déjà comptée → pas de boucle).
        }
      }
    }

    // Préavis de fin de contexte (MIN-113) : le modèle doit savoir qu'il approche
    // du seuil AVANT qu'on le coupe, pour conclure son étape plutôt que d'ouvrir
    // une exploration qu'un résumé va trancher au milieu. Placé APRÈS la
    // compaction : si elle vient de tourner, le contexte est retombé et il n'y a
    // plus rien à annoncer.
    const contextNow = lastPromptTokens ?? estimateTokens(messages);
    if (!contextWarned && contextNow >= compactThreshold * CONTEXT_WARNING_RATIO) {
      contextWarned = true;
      messages.push({ role: "user", content: CONTEXT_WARNING_MESSAGE });
      await emit("status", {
        phase: "context_warning",
        tokens: contextNow,
        threshold: compactThreshold,
      });
    }

    let stream: StreamResult;
    let contextTrims = 0;
    for (;;) {
      try {
        stream = await streamCompletion({
          apiKey,
          model,
          baseUrl,
          provider,
          messages,
          tools,
          signal: params.signal,
          checkInterrupt: params.checkInterrupt,
          onProgress: params.emitLive,
          reasoningLevel: params.reasoningLevel,
          // Le refus est lisible dans le fil plutôt que silencieux : sans ça, un
          // niveau choisi resterait affiché alors qu'il n'a aucun effet.
          onReasoningUnsupported: () => {
            void emit("status", { phase: "reasoning_unsupported", model });
          },
          deadlineAt: startedAt + params.softDeadlineMs,
        });
        break;
      } catch (err) {
        // 400 « contexte trop long » : dernier recours — retire le round le plus
        // ancien (sûr pour l'appariement) et retente le MÊME appel, jusqu'à
        // MAX_CONTEXT_TRIMS. On ne touche ni au système ni au message de tâche.
        if (
          err instanceof StreamError &&
          err.status === 400 &&
          isContextLengthError(err.message) &&
          contextTrims < MAX_CONTEXT_TRIMS &&
          dropOldestRound(messages)
        ) {
          contextTrims++;
          await emit("status", { phase: "context_trim" });
          continue;
        }
        // Erreur transitoire épuisée (429/5xx/réseau) → SUSPENDRE le run (reprise au
        // chunk suivant, fonction fraîche) plutôt qu'échouer. Une erreur fatale (4xx,
        // requête invalide) remonte et échoue le run.
        if (err instanceof StreamError && err.retryable) {
          clearLive();
          await emit("status", { phase: "transient_error", message: cap(err.message, 300) });
          return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
        }
        // Interruption utilisateur pendant le stream → repos, round partiel jeté.
        if (err instanceof InterruptedError) {
          clearLive();
          return { status: "interrupted", messages, costUsd, usageSeqEnd: seq, rounds: round };
        }
        // Erreur LLM FATALE (non reprenable : 402 crédits, 401/403, 400 non-contexte).
        // On REPOSE en renvoyant les messages → l'exécuteur persiste le checkpoint
        // (aucun steering déjà injecté ce round n'est perdu). Pas de re-queue : ça
        // rebouclerait sur la même erreur.
        if (err instanceof StreamError) {
          clearLive();
          await emit("error", { message: cap(err.message, 300) });
          return {
            status: "error",
            messages,
            errorMessage: cap(err.message, 1000),
            costUsd,
            usageSeqEnd: seq,
            rounds: round,
          };
        }
        throw err;
      }
    }

    await recordAiUsage({
      runId,
      seq: seq++,
      feature: "agent_code",
      model: stream.modelUsed ?? model,
      generationId: stream.generationId,
      promptTokens: stream.usage.promptTokens,
      completionTokens: stream.usage.completionTokens,
      totalTokens: stream.usage.totalTokens,
      cost: stream.usage.cost,
      userId: params.userId ?? null,
      projectId: params.projectId ?? null,
    });
    costUsd += stream.usage.cost ?? 0;
    // Taille de contexte réelle pour la décision de compaction du prochain round.
    lastPromptTokens = stream.usage.promptTokens ?? lastPromptTokens;

    // Raisonnement (MIN-122) : JAMAIS poussé dans `messages` (chat-completions ne le
    // round-trippe pas ; le persister gonflerait/rejouerait le contexte) et jamais
    // streamé à l'écran — le fil n'a montré qu'un indicateur + un compteur. On en
    // garde la trace, repliée, avec la durée que le compteur affichait.
    // `kind: "reasoning"` distingue cet event des `thinking` de NARRATION émis plus
    // bas (du texte du modèle, rendu en bulle) : même type, deux rendus.
    if (stream.reasoning.trim() || stream.reasoningMs > 0) {
      await emit("thinking", {
        text: cap(stream.reasoning, 2000),
        kind: "reasoning",
        durationMs: stream.reasoningMs,
      });
    }
    // Le contenu n'est émis en `thinking` QUE s'il accompagne des tool-calls (pensée
    // intermédiaire). Un round SANS tool-call est la réponse finale : elle part en
    // `summary` seul juste en dessous — l'émettre aussi ici créerait une bulle
    // dupliquée dès que la réponse dépasse le cap (2000 ≠ 8000 → le dédoublonnage
    // par égalité de texte du feed ne matche plus).
    if (stream.content.trim() && stream.toolCalls.length > 0) {
      await emit("thinking", { text: cap(stream.content, 2000) });
    }

    // Arrêt naturel sans tool-call → FIN DE TOUR : le texte du modèle est sa
    // réponse à l'utilisateur (le feed la rend comme bulle de clôture du tour).
    if (stream.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: stream.content || "" });
      const reply = stream.content.trim() || "Done.";

      // Dernier mot du harness (MIN-110) : le type-check de fin de tour. S'il a
      // quelque chose à dire, ce n'était pas la fin du tour — on injecte et on
      // reboucle. La réponse écrite part en `thinking` (même convention qu'un
      // round texte + tool-calls) : elle reste dans le fil comme étape, sans
      // clore le tour à l'écran.
      if (params.onTurnEnd && turnEndReentries < MAX_TURN_END_REENTRIES) {
        const followUp = await params
          .onTurnEnd({ budgetMs: params.softDeadlineMs - elapsed() })
          .catch(() => null);
        if (followUp?.trim()) {
          turnEndReentries++;
          // `reply` porte un « Done. » de repli quand le modèle n'a rien écrit :
          // seul un vrai texte mérite de rester dans le fil comme étape.
          if (stream.content.trim()) await emit("thinking", { text: cap(stream.content, 2000) });
          messages.push({ role: "user", content: followUp });
          clearLive();
          continue;
        }
      }

      await emit("summary", { text: cap(reply, 8000) });
      clearLive();
      return {
        status: "completed",
        messages,
        reply,
        costUsd,
        usageSeqEnd: seq,
        rounds: round,
      };
    }

    clearLive();
    messages.push({ role: "assistant", content: stream.content || null, tool_calls: stream.toolCalls });

    // Fast-path : si TOUS les tool-calls du round sont read-only (exploration), on
    // les exécute EN PARALLÈLE — les tools sont des round-trips réseau au Sandbox.
    // Résultats poussés dans l'ordre d'origine → pairing tool_call↔résultat préservé.
    if (
      stream.toolCalls.length > 1 &&
      stream.toolCalls.every((t) => READ_ONLY_TOOLS.has(t.function.name))
    ) {
      for (const tc of stream.toolCalls) {
        const args = safeParse(tc.function.arguments);
        await emit("tool_call", { id: tc.id, name: tc.function.name, ...toolArgSummary(tc.function.name, args) });
      }
      const outcomes = await Promise.all(
        stream.toolCalls.map(async (tc) => {
          const args = safeParse(tc.function.arguments);
          try {
            const { result, success, reason, images } = await execTool(tc.function.name, args);
            return { tc, result, success, reason, images };
          } catch (err) {
            return {
              tc,
              result: { error: err instanceof Error ? err.message : String(err) },
              success: false,
              reason: undefined,
              images: undefined,
            };
          }
        }),
      );
      for (const o of outcomes) {
        messages.push({ role: "tool", tool_call_id: o.tc.id, content: toolMessageContent(o.result, o.images) });
        await emit("tool_result", {
          id: o.tc.id,
          name: o.tc.function.name,
          success: o.success,
          preview: previewResult(o.result),
          ...(o.reason ? { reason: o.reason } : {}),
        });
      }
      continue;
    }

    // ask_user (MIN-86) : levé quand le round a posé des questions valides → le
    // tour se termine après l'exécution de TOUS les tool-calls du round (chaque
    // appel garde sa réponse : l'appariement du checkpoint reste intact).
    let askedUser = false;

    for (const tc of stream.toolCalls) {
      const name = tc.function.name;
      const args = safeParse(tc.function.arguments);

      // update_plan : tool de contrôle légère — n'émet QUE l'event plan_update (le
      // feed le rend en checklist), répond au tool-call, et ne passe pas au Sandbox.
      if (name === "update_plan") {
        const plan = normalizePlan(args.plan);
        await emit("plan_update", { plan });
        // Miroir vers le plan de l'issue — best-effort, ne bloque jamais le run.
        await params.syncPlan?.(plan).catch(() => {});
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }

      // ask_user (MIN-86) : tool de contrôle TERMINAL — répond au tool-call avec
      // un statut d'attente, émet l'event `question` (le feed le rend en carte de
      // questions), puis le tour se termine : la session repose jusqu'à la réponse
      // de l'utilisateur, qui revient par le steering au tour suivant. Le parseur
      // absorbe la forme legacy `{question, suggestions}` des vieux checkpoints.
      if (name === "ask_user") {
        const questions = parseAskUserQuestions(args);
        if (questions.length === 0) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              error:
                "ask_user requires a non-empty `questions` array: [{question, suggestions?}].",
            }),
          });
          continue;
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ status: "awaiting_user_response" }),
        });
        await emit("question", { id: tc.id, questions });
        askedUser = true;
        continue;
      }

      // Shim LEGACY : les checkpoints d'avant le débridage portent un système qui
      // décrit `finish`. Ce tool n'existe plus — on répond au tool-call
      // (l'appariement doit rester intact) en expliquant le nouveau protocole, et
      // le modèle conclut son tour en texte au round suivant.
      if (name === "finish") {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({
            error: `The finish tool no longer exists. Turns now end naturally: simply write your reply as a plain text message with no tool calls.`,
          }),
        });
        continue;
      }

      await emit("tool_call", { id: tc.id, name, ...toolArgSummary(name, args) });

      let result: unknown;
      let success: boolean;
      let reason: string | undefined;
      let images: AgentToolImage[] | undefined;
      try {
        ({ result, success, reason, images } = await execTool(name, args));
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        success = false;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: toolMessageContent(result, images) });
      await emit("tool_result", {
        id: tc.id,
        name,
        success,
        preview: previewResult(result),
        ...(reason ? { reason } : {}),
      });
    }

    // ask_user → FIN DE TOUR : les questions sont posées (event `question` émis),
    // tous les tool-calls du round ont leur réponse dans `messages` (frontière
    // sûre). Pas de `summary` — la carte de questions clôt le tour dans le feed ;
    // `reply` vide → commit générique et pas d'outcome.
    if (askedUser) {
      return {
        status: "completed",
        messages,
        reply: "",
        askedUser: true,
        costUsd,
        usageSeqEnd: seq,
        rounds: round,
      };
    }
    // on reboucle (le tour ne se termine que sur une réponse sans tool-call)
  }
}
