import type { AssistantToolCall } from "@/lib/assistant-types";
import { parseAskUserQuestions } from "@/lib/ask-user";
// Les FORMES d'usage, jamais l'écriture (MIN-224). `ai-usage.ts` tient le client
// Supabase en clé de service : l'importer ici mettrait `SUPABASE_SERVICE_ROLE_KEY`
// dans l'environnement du process où le modèle exécute du shell arbitraire, et un
// `env` suffirait. L'écriture arrive donc par `params.recordUsage` — la fonction
// passe `recordAiUsage`, la microVM passe un POST vers le plan de contrôle.
import {
  parseOpenRouterUsage,
  OPENROUTER_USAGE_INCLUDE,
  type OpenRouterUsage,
  type NormalizedUsage,
  type AiFeature,
  type AiUsageBillTo,
} from "@/lib/server/ai-usage-shape";
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
import type { EditTelemetry } from "./edit";
import { textOf, type AgentContentPart, type AgentToolImage } from "./content";
import { pruneToolOutputs, capHistoryImages, headTail, TOOL_RESULT_MAX_CHARS } from "./prune";
import type { AgentLiveEdit } from "./exec-tool";
import { markSystemPromptCache } from "./caching";
import type { RedactText } from "./redact";
import {
  estimateTokens,
  estimateTokensFromChars,
  planCompaction,
  serializeForSummary,
  dropOldestRound,
  SUMMARIZE_INSTRUCTION,
  COMPACT_SUMMARY_PREFIX,
} from "./compact";
import { abandonedSpend, type AbandonedStream } from "./abandoned-spend";
import { ToolLoopDetector } from "./tool-loop";
// L'index OpenRouter directement, et pas les capacités de `model.ts` : celui-ci
// tire le client Supabase et le déchiffrement BYOK, dont cette boucle n'a rien à
// faire. Les prix ne servent qu'à estimer un essai abandonné (MIN-216).
import { getOpenRouterModelInfo } from "./openrouter-index";
import {
  AGENT_COMPACT_TOKEN_THRESHOLD,
  agentCompactThreshold,
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
  MIN_STREAM_ATTEMPT_MS,
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
 *  - chaque appel → `recordAiUsage(feature, run_id)` — `agent_code`, ou
 *    `routine_code` sur un passage de routine (MIN-185) ; chaque étape
 *    → `emit` vers agent_run_events (live view).
 *  - FIN DE TOUR NATURELLE : le tour se termine quand le modèle répond SANS
 *    tool-call — sa réponse texte est le message à l'utilisateur (`reply`). Un seul
 *    tool de contrôle peut aussi clore le tour : `ask_user` (MIN-86) — questions
 *    structurées émises en event `question`, la session repose jusqu'à la réponse
 *    (`finish` reste supprimé — modèle conversationnel).
 * Les tools « métier » (read_file/write_file/run_command/create_pr…) sont délégués
 * à `execTool` (fourni par execute.ts, qui détient le Sandbox).
 */

/**
 * Garde-fou anti-runaway, PAS un budget : ce qui doit borner un chunk normal est le
 * TEMPS (`softDeadlineMs`), pas un compteur de rounds. Relevé de 60 à 150 quand le
 * chunk est passé de 250 s à 700 s — à 60, le compteur serait devenu la contrainte
 * qui mord en premier, et chaque tour un peu long se serait mis à suspendre pour
 * une raison qui n'a rien à voir avec le temps réellement disponible.
 */
const MAX_ROUNDS_PER_CHUNK = 150;
/**
 * LE HARNESS NE ROUVRE PLUS UN TOUR TERMINÉ (MIN-263).
 *
 * Il y avait ici un plafond de relances, et au bout un crochet qui rendait la parole
 * au harness après que le modèle avait écrit sa réponse : type-check, tests,
 * relecture. Le tour repartait, le modèle répondait une seconde fois, et c'est cette
 * seconde réponse que l'utilisateur lisait.
 *
 * Ce mécanisme a coûté trois correctifs successifs, tous du même défaut : la
 * réponse visible parlait du CONTRÔLE et plus du travail (MIN-256), puis la règle
 * qui l'interdisait ne suffisait pas et il a fallu rendre au modèle son brouillon
 * (MIN-249 bis). On ne rattrapait pas des bugs, on rattrapait la conséquence
 * inévitable d'avoir rouvert un tour fini.
 *
 * Ni Codex ni OpenCode n'ont ça. Chez eux, tout retour du harness arrive **dans le
 * résultat d'un tool** : OpenCode recolle les diagnostics LSP au résultat de
 * l'édition, Codex ne rend rien du tout et confie la vérification au prompt. Un
 * retour attaché à un geste ne coûte aucune réponse et ne déclasse aucun message.
 *
 * D'où la règle, qui est maintenant un invariant de ce fichier : **quand le modèle
 * répond sans tool-call, le tour se termine.** Les contrôles du harness vivent sur
 * les portes de tools (`gateCreatePr`, `gateWritePlan`, cf. delivery-gate.ts) et sur
 * le prompt, jamais ici.
 */
/**
 * Garde-fou : relances du tour sur une réponse INCOMPLÈTE (MIN-203) — coupée au
 * plafond de tokens, ou vide. Deux : un modèle qui
 * n'arrive pas à finir sa phrase en trois passages ne finira pas au quatrième, et
 * chaque passage se paie. Au-delà, le tour s'arrête EN DISANT qu'il s'est arrêté.
 */
const MAX_INCOMPLETE_REENTRIES = 2;
/**
 * Ce qu'on injecte pour faire reprendre le modèle. En anglais, comme tout ce qui
 * s'adresse au modèle dans ce fichier — ce n'est pas de l'UI.
 */
const TRUNCATED_NUDGE =
  "Your reply was cut off at the token limit before you finished — it was NOT delivered as a conclusion. Continue from exactly where you stopped, and keep it short enough to fit. If work remains, call the tools you need instead of writing a long summary.";
const EMPTY_REPLY_NUDGE =
  "Your last round came back empty: no text, no tool call. Nothing was delivered. Either call the tool you need, or write your reply to the user.";
/**
 * Ce que lit le modèle d'un tool-call que la fin du chunk a laissé sur le carreau
 * (MIN-214). Il doit distinguer « pas exécuté » de « exécuté et raté » : sans ça, un
 * `run_command` sauté se lirait comme une commande en échec, et le round suivant
 * partirait déboguer un problème qui n'existe pas.
 */
const TOOL_NOT_EXECUTED_NOTE =
  "not executed: this turn ran out of time and was suspended right before this call. Nothing was run, nothing changed. The turn resumes with a fresh time budget — call this tool again if you still need it.";
/** Tag mesurable sur agent_run_events, comme `forbidden_command` côté commandes. */
const SUSPENDED_TOOL_REASON = "turn_suspended";
/**
 * Garde-fou PROPRE aux sous-agents (MIN-112) : relances du tour pour livrer un
 * rapport arrivé après que le modèle a rendu la main. Indépendant de
 * les autres relances — un tour qui délègue trois fois de suite est un tour
 * normal. Le
 * plafond existe quand même : sans lui, une fille qui relance une fille (impossible
 * par construction) ou un rapport qui ne se drainerait jamais retiendrait le tour.
 */
const MAX_SUBAGENT_WAIT_REENTRIES = 8;
/**
 * Cadence à laquelle les DEUX moteurs relisent le plafond de dépense
 * (`refreshBudgetUsd`). Ici plutôt que chez chacun d'eux : une fenêtre de perte
 * qui différerait entre les deux formes serait exactement le genre d'écart que
 * MIN-224 s'attache à ne pas créer.
 *
 * Une minute, et pas à chaque round : la lecture coûte deux requêtes (facturation
 * + somme du ledger) et un round peut durer trois secondes. Ce qui peut se perdre
 * entre deux lectures est donc borné par ce que les AUTRES runs dépensent en une
 * minute — contre cinq pour l'ancienne forme, qui ne relisait qu'entre ses chunks,
 * et contre un tour entier (des heures) pour la nouvelle, qui ne relisait pas.
 */
export const BUDGET_REFRESH_INTERVAL_MS = 60_000;
/**
 * Garde-fou de compaction : au plus `MAX_COMPACTIONS_PER_WINDOW` compactions par
 * FENÊTRE DE ROUNDS (convergence normalement immédiate — le quota n'existe que
 * pour qu'un résumé qui ne réduit rien ne relance pas un sous-appel payant à
 * chaque round).
 *
 * Le compteur était « par chunk » (MIN-259), c'est-à-dire par appel de
 * `runAgentLoop`. Le nom disait vrai tant qu'un appel valait un chunk de ~700 s :
 * il repartait toutes les douze minutes. Le moteur microVM, lui, appelle la
 * boucle UNE FOIS pour le tour entier (12 h de soft-deadline, 2 000 rounds) — le
 * même « 3 » bornait donc des heures de travail, et une fois épuisé le bloc était
 * sauté en silence jusqu'à la fin du tour.
 *
 * La fenêtre vaut `MAX_ROUNDS_PER_CHUNK` : sur l'ancienne forme, un appel de
 * boucle tient dans UNE fenêtre et le comportement est inchangé, au round près.
 * Sur un tour long, le quota se recharge tous les 150 rounds.
 */
const MAX_COMPACTIONS_PER_WINDOW = 3;
const COMPACTION_WINDOW_ROUNDS = MAX_ROUNDS_PER_CHUNK;
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
/**
 * Le préavis est-il DÉJÀ dans le contexte ? (MIN-218)
 *
 * « Déjà prévenu » n'est pas un état à tenir : c'est une propriété de
 * l'historique, et l'historique EST le checkpoint. Un drapeau en RAM ne
 * connaissait que son chunk — il repartait à faux à chaque reprise, alors que le
 * préavis du chunk précédent, lui, était toujours là. Le message était donc
 * réinjecté à chaque chunk, et il dit « finis ton étape et réponds » : de quoi
 * faire conclure un tour qui n'avait aucune raison de conclure, chunk après chunk.
 * La compaction ne rattrapait rien (elle mord à 100 % du seuil, le préavis part à
 * 70 % : toute la bande entre les deux se répétait).
 *
 * Lu dans les messages, l'invariant devient « une seule copie VIVANTE », et il se
 * répare tout seul dans les deux sens : tant que le modèle voit le message à
 * chaque appel, le redire ne lui apprend rien ; le jour où la compaction,
 * `dropOldestRound` ou le dernier palier de `fitCheckpoint` l'emporte, il l'a
 * oublié et un nouveau préavis est légitime.
 */
function hasContextWarning(messages: ReadonlyArray<AgentChatMessage>): boolean {
  return messages.some((m) => m.role === "user" && textOf(m.content) === CONTEXT_WARNING_MESSAGE);
}
/** Tools d'exploration sans effet de bord → parallélisables dans un même round. */
const READ_ONLY_TOOLS = new Set([
  "read_file",
  "list_dir",
  "glob",
  "grep",
  "search_issues",
  "read_issue",
  "read_resource",
  // L'alias d'avant MIN-184 : un checkpoint repris le rejoue.
  "read_attachment",
  "read_feedback",
  "read_scratchpad",
  // Suivi des sous-agents (MIN-112) : deux lectures du registre en mémoire, sans
  // effet de bord. `spawn_agent` n'y est PAS — il lance du travail.
  "agent_status",
  "list_agents",
]);

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
  /**
   * Id du tool-call en cours, tel qu'il part sur l'event `tool_call`. Sert à
   * RATTACHER ce qu'un tool engendre à sa ligne du fil : les events d'un sous-agent
   * portent le `parent_call_id` de son `spawn_agent` (MIN-112), et le fil les replie
   * dessous au lieu d'ouvrir une bulle par event.
   */
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
   * Ce que la cascade d'édition a fait (MIN-246) : quel replacer a résolu, à quel
   * rang, avec quelle similarité, et quels refus. Voyage À CÔTÉ du résultat —
   * le modèle n'a rien à faire de ces chiffres, mais qui relit `agent_run_events`
   * six mois plus tard, si. Recopié tel quel dans l'event `tool_result`.
   */
  edit?: EditTelemetry;
  /**
   * Ce que le harness a de LONG à dire sur cet appel (MIN-247) : servi au modèle
   * en message `user`, après que tous les tool-calls du round ont leur réponse.
   *
   * Le `result` d'un tool traverse `headTail(…, TOOL_RESULT_MAX_CHARS)`, qui élide
   * le MILIEU — parfait pour une sortie de commande dont le verdict est en queue,
   * ruineux pour un document qu'on donne à LIRE EN ENTIER. Le seul usage à ce jour
   * est la porte de `create_pr` (`gateCreatePr`), qui rend le diff du tour : un
   * diff amputé de son milieu ne se relit pas, et c'est précisément la relecture
   * qu'on essaie de faire avoir lieu.
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
 * Une ligne de ledger, telle que la boucle la produit — la MÊME forme
 * qu'`AiUsageInput`, redite ici pour que ce module ne dépende pas de celui qui
 * écrit (cf. l'import du haut).
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
 * Où part une ligne de ledger. Injecté, et OBLIGATOIRE : c'est ce qui fait que
 * la boucle ne connaît plus le chemin de la base (MIN-224). Deux implémentations
 * — `recordAiUsage` dans la fonction, `POST /api/agent-vm/usage` dans la microVM
 * — et la boucle ne sait pas laquelle elle a.
 *
 * Best-effort des deux côtés : elle ne doit jamais faire échouer un round.
 */
export type RecordAgentUsage = (line: AgentUsageLine) => Promise<void>;

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
  /** Imputation des lignes `ai_usage` du run (MIN-131) — jamais devinée ici. */
  billTo: AiUsageBillTo;
  /**
   * Sous quelle FEATURE les appels de cette boucle s'écrivent au ledger.
   * `agent_code` par défaut ; `routine_code` pour un passage de routine
   * (MIN-185) — même moteur, autre ligne de facture. Résolu UNE fois par
   * l'appelant et passé ici : le résoudre à chaque `recordAiUsage` invite à en
   * oublier un, et une ligne oubliée range la dépense sous « Agents » pour
   * toujours. Les sous-agents héritent du même champ : ils se facturent avec
   * leur mère.
   */
  feature?: Extract<AiFeature, "agent_code" | "routine_code">;
  projectId?: string | null;
  /** Où partent les lignes `ai_usage` de cette boucle (cf. `RecordAgentUsage`). */
  recordUsage: RecordAgentUsage;
  /** Budget du chunk courant, mesuré depuis l'entrée dans la boucle. */
  softDeadlineMs: number;
  /**
   * Budget d'usage RESTANT (USD) au moment d'entrer dans le chunk. La boucle
   * s'arrête à la frontière de round dès que le chunk l'a consommé. `undefined` =
   * pas de plafond (BYOK : l'utilisateur paie sa propre note).
   */
  budgetUsd?: number;
  /**
   * RELIT le restant, en cours de route — parce qu'un plafond snapshoté à l'entrée
   * ne sait rien de ce que les AUTRES runs dépensent pendant ce temps.
   *
   * Rien ne réserve de budget : deux runs lancés à la même seconde lisent le même
   * restant `R` et le prennent chacun pour plafond, donc ils peuvent dépenser `2R`.
   * Ce qui rattrape, c'est la fréquence à laquelle on relit — l'ancienne forme
   * relisait à chaque chunk (cinq minutes au pire) ; un tour de microVM, lui, dure
   * des heures, ce qui ferait de ce snapshot un plafond aveugle du début à la fin.
   *
   * Rend ce que le TOUR a encore le droit de dépenser À PARTIR DE MAINTENANT — pas
   * un total : la boucle en refait un plafond par `dépense du tour + restant`, ce
   * qui laisse la comparaison intacte et corrige au passage le retard du ledger.
   * `null` = inconnu (lecture en panne) ou illimité : on garde le plafond courant,
   * une panne de facturation ne doit pas arrêter un run.
   *
   * L'appelant décide de la CADENCE (une lecture par minute, pas par round : elle
   * coûte deux requêtes) et calcule le `min` avec le plafond du run s'il y en a un.
   * La boucle ne fait qu'obéir, comme pour `recordUsage`.
   */
  refreshBudgetUsd?: () => Promise<number | null>;
  // (cadence recommandée : `BUDGET_REFRESH_INTERVAL_MS`, ci-dessous)
  /**
   * Ce que le CHUNK a déjà dépensé, en dollars — le compteur que `budgetUsd`
   * plafonne. PARTAGÉ (MIN-202) : l'appelant en crée UN par chunk et le passe à la
   * boucle du parent comme à celle de chacune de ses filles, qui tournent toutes
   * dans le même process — un objet mutable suffit, aucun verrou n'est nécessaire.
   *
   * Sans ce partage, `budgetUsd` était un scalaire COPIÉ : chaque fille comparait sa
   * propre dépense au même plafond, et le parent n'apprenait la leur qu'au retour de
   * leur rapport — donc après qu'elles l'avaient dépensée. Six filles en parallèle
   * plus le parent, et une routine réglée à 0,75 $ pouvait en prendre 5,25 $ : le
   * garde-fou était défait par le mécanisme même qu'il devait borner.
   *
   * Absent = compteur local, c'est-à-dire le comportement d'une boucle seule.
   */
  chunkSpend?: { usd: number };
  /**
   * Appelé à CHAQUE appel payé, avec ce qu'il vient de coûter (MIN-220). La boucle
   * rend déjà son total en fin de course : ce crochet sert à qui ne peut pas
   * attendre la fin.
   *
   * C'est le cas du registre des sous-agents. La dépense d'une fille n'atterrissait
   * sur son record qu'au `.then()` de sa promesse — or `cutAll()` et `suspendAll()`
   * ne l'attendent que `CUT_GRACE_MS`, et une fille abortée pendant un
   * `run_command` (tests, build) ne rend la main qu'à la fin de la commande, bien
   * après. Son record était alors déclaré `cut` avec le coût d'AVANT le chunk,
   * `settleUnbilled()` n'avait rien à imputer, et tout ce qu'elle avait dépensé
   * manquait à `agent_runs.cost_usd` — pendant que le ledger `ai_usage`, lui, avait
   * bien reçu ses appels.
   *
   * Un crochet SYNCHRONE, et volontairement : il doit avoir couru avant que la
   * boucle ne puisse être abandonnée en vol.
   */
  onSpend?: (usd: number) => void;
  /**
   * Fenêtre de contexte (tokens) du modèle, si connue → borne haute du seuil de
   * compaction (75 % de cette fenêtre). Absent = `AGENT_COMPACT_TOKEN_THRESHOLD`.
   */
  contextWindow?: number | null;
  /**
   * Prix d'ENTRÉE du modèle (USD/Mtok), si connu. C'est lui qui dimensionne le
   * seuil de compaction : le plafond borne un coût par round, pas un nombre de
   * tokens (cf. `agentCompactThreshold`). Absent → valeur calibrée.
   */
  inputUsdPerMTok?: number | null;
  execTool: ExecuteAgentTool;
  /**
   * Substitue les secrets du run (le token de forge) dans les sorties de tools,
   * AVANT qu'elles ne quittent la boucle (MIN-239).
   *
   * Le token est dans `.git/config` — `git clone` l'y écrit — et trois tools l'en
   * sortent. Sans ce crochet il part dans l'event `tool_result` (`agent_run_events`,
   * persisté 30 jours) ET dans le message `role:"tool"` de l'historique, donc dans
   * le checkpoint. Les deux sont des tables que des humains lisent, longtemps après.
   *
   * Posé ici plutôt qu'au ras des tools parce que c'est le seul endroit par lequel
   * les DEUX sorties du même résultat passent — et parce que le modèle non plus ne
   * doit pas voir le token : ce qu'il ne voit pas, il ne peut pas le recommettre.
   *
   * Absent = pas de secret à substituer (tests, boucle sans dépôt).
   */
  redact?: RedactText;
  /**
   * Draine les messages de steering en attente (file `agent_run_messages`).
   * Appelé au SOMMET de chaque round : les messages renvoyés sont injectés comme
   * messages `user` avant le prochain appel LLM → orientation à chaud + reprise
   * d'un `ask_user`. Optionnel (absent = pas de steering).
   */
  pullSteering?: () => Promise<string[]>;
  /**
   * Rapports de sous-agents TERMINÉS, drainés au SOMMET de chaque round juste après
   * le steering (MIN-112) : chaque rapport devient un message `user`. C'est ÇA le
   * wakeup — le parent n'a jamais attendu, le rapport arrive tout seul à la
   * prochaine frontière sûre, exactement comme un message de steering. Absent = pas
   * de délégation sur ce run.
   *
   * `costUsd` est ajouté à l'accumulateur RENDU par la boucle : sans lui, la
   * dépense des filles n'arriverait jamais jusqu'à `run.cost_usd` (c'est le trou de
   * facturation le plus facile à laisser ouvert). Il n'entre PAS dans `spend` : la
   * fille l'y a déjà porté en payant, et l'y remettre le compterait deux fois.
   */
  pullSubagentReports?: () => Promise<Array<{ id: string; text: string; costUsd: number }>>;
  /**
   * Dernière chance de livrer un rapport avant que le tour ne se termine (MIN-112) :
   * appelé quand le modèle répond SANS tool-call, avec le budget
   * mural restant. Tant qu'il rend des rapports, le tour REPART (plafond
   * `MAX_SUBAGENT_WAIT_REENTRIES`). C'est ce qui fait tenir le contrat annoncé dans
   * la description de `spawn_agent` — « tu n'attends pas, le rapport te revient » —
   * à l'intérieur du chunk : une promesse ne survivrait pas à la fin de la fonction
   * Vercel. Si le budget tombe d'abord, l'appelant coupe les filles en vol et livre
   * leur rapport PARTIEL au chunk suivant.
   */
  awaitSubagents?: (opts: { budgetMs: number }) => Promise<{
    reports: Array<{ id: string; text: string; costUsd: number }>;
    /**
     * L'attente a été rompue par un MESSAGE de l'utilisateur, sans qu'aucune fille
     * n'ait fini. Le tour repart quand même : le sommet du round suivant draine le
     * steering, et le parent peut répondre — pendant que les filles continuent de
     * tourner. C'est ce qui permet à l'utilisateur de réveiller un agent qu'il
     * trouve trop long, sans tuer le travail en cours.
     */
    interrupted?: boolean;
    /**
     * Le chunk n'a plus de budget mais une fille TRAVAILLE ENCORE, son état sauvé.
     * La boucle SUSPEND alors le tour au lieu de le terminer : l'appelant persiste
     * le checkpoint et re-queue, la fille repart au chunk suivant. C'est ce qui lui
     * permet de dépasser les 300 s de la fonction Vercel — sans quoi toute tâche
     * déléguée de plus de trois minutes serait coupée à mi-chemin.
     */
    suspend?: boolean;
  }>;
  /**
   * Ce chunk reprend un tour GARÉ en attente de ses sous-agents : le parent avait
   * déjà répondu, il n'a rien de neuf à dire. On attend donc AVANT le premier appel
   * LLM plutôt qu'après — sinon chaque chunk d'attente paierait un aller-retour au
   * modèle pour lui faire redire qu'il attend.
   */
  parkedForSubagents?: boolean;
  /**
   * Plafond de rounds de CETTE boucle (défaut `MAX_ROUNDS_PER_CHUNK`). Sert à borner
   * une boucle FILLE (MIN-112) : un sous-agent n'a pas de reprise, laisser tourner
   * soixante rounds au nom du parent n'a aucun sens.
   */
  maxRounds?: number;
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
  /**
   * Pourquoi le chunk s'est suspendu, quand ce n'est PAS la frontière normale
   * (soft-deadline, plafond de rounds, fille encore en vol) — MIN-219.
   *
   * `transient_error` : le fournisseur est tombé et les reprises internes n'ont
   * rien pu y faire. Le chunk n'a pas avancé d'un round, et l'exécuteur doit le
   * traiter comme une ATTENTE (re-queue différé, hors budget de continuations)
   * plutôt que comme une continuation. Sans ce nom, les deux se ressemblaient
   * trait pour trait au retour, et une panne de quelques minutes brûlait les 20
   * continuations du tour en re-queues immédiats.
   */
  suspendReason?: "transient_error";
  /** Erreur LLM fatale (non reprenable) : renvoyée AVEC les messages pour que
   *  l'exécuteur persiste le checkpoint (pas de perte de contexte/steering).
   *  Portée aussi par une suspension `transient_error`, où elle dit ce que le
   *  fournisseur a répondu en dernier — c'est ce texte que l'utilisateur lira si
   *  la panne dure au-delà du budget d'attente. */
  errorMessage?: string;
  costUsd: number;
  usageSeqEnd: number;
  rounds: number;
}

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

/**
 * Arguments d'un tool-call. `null` = ILLISIBLES (MIN-204), et c'est le seul
 * point qui compte : rendre `{}` sur un JSON tronqué faisait exécuter
 * `sh -c ""` — exit 0, sortie vide — et le modèle lisait un ✓ là où rien
 * n'avait tourné. L'appelant court-circuite `execTool` et rend l'échec au
 * modèle, qui réémet simplement l'appel au round suivant.
 *
 * Un `arguments` vide reste `{}` : c'est la forme légitime d'un tool sans
 * paramètre. Un tableau, lui, est illisible — `args.command` y serait
 * `undefined`, soit exactement le piège silencieux qu'on ferme.
 */
function safeParse(json: string): Record<string, unknown> | null {
  if (!json.trim()) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Le détail rendu au modèle quand `safeParse` a rendu `null`. */
function argsParseError(json: string): string {
  try {
    JSON.parse(json);
    return "arguments must be a JSON object";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * L'aperçu persisté dans l'event `tool_result`. La substitution des secrets passe
 * AVANT le cap (MIN-239) : couper à 400 caractères ne protège rien — l'URL de clone
 * token comprise tient largement dessous, c'est bien pour ça qu'elle atterrissait
 * entière dans `agent_run_events`.
 */
function previewResult(result: unknown, redact?: RedactText): string {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  return cap(redact ? redact(text) : text, 400);
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
  redact?: RedactText,
): string | AgentContentPart[] {
  const json = JSON.stringify(result);
  const text = headTail(redact ? redact(json) : json, TOOL_RESULT_MAX_CHARS);
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
    case "read_resource":
    case "read_attachment":
      return {
        resource_id: String(args.resource_id ?? args.attachment_id ?? ""),
      };
    case "read_feedback":
      return { feedback_post_id: String(args.feedback_post_id ?? "") };
    // Tools minddy (MIN-125). Sans ces cas, les events persistés partent avec
    // `{}` et le fil relu affiche « Recherche de « … » » ou « 0 tâche » — le
    // résumé EST ce que la relecture du run a pour raconter l'appel.
    case "search_issues":
      return { query: cap(String(args.query ?? ""), 100) };
    case "read_issue":
      // `issue` seulement quand il est passé : sur le ticket de la session, son
      // absence est l'information (« il a relu SON ticket »).
      return args.issue ? { issue: String(args.issue) } : {};
    case "write_issue_plan":
      return {
        chars: String(args.plan ?? "").length,
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "update_issue":
      return {
        fields: ["title", "description", "effort"].filter((f) => args[f] !== undefined),
        ...(args.issue ? { issue: String(args.issue) } : {}),
      };
    case "create_issue":
      return { title: cap(String(args.title ?? ""), 200) };
    case "add_scratchpad_tasks":
    case "update_scratchpad_task":
      return { count: Array.isArray(args.tasks) ? args.tasks.length : 0 };
    case "set_scratchpad":
      return { chars: String(args.content ?? "").length };
    // Sous-agents (MIN-112). Sans ces cas, le payload persisté part à `{}` et le
    // bloc replié du fil n'a rien à afficher au replay : ni le mode, ni la tâche,
    // ni le modèle sur lequel la fille a tourné.
    case "spawn_agent":
      return {
        mode: String(args.mode ?? ""),
        task: cap(String(args.task ?? ""), 200),
        ...(args.model ? { model: String(args.model) } : {}),
        ...(args.thinking_effort ? { thinking_effort: String(args.thinking_effort) } : {}),
        ...(args.prompt_template ? { prompt_template: String(args.prompt_template) } : {}),
      };
    case "agent_status":
      return { id: String(args.id ?? "") };
    default:
      return {};
  }
}

/**
 * Ce qu'un appel de tool a REGARDÉ, réduit à une clé — ou `null` s'il n'a rien
 * regardé de re-lisible (MIN-248). Deux appels de même clé disent la même chose du
 * même objet : `pruneToolOutputs` ne garde que le plus récent, et le garde quel que
 * soit son âge.
 *
 * La clé ignore délibérément `offset`/`limit` : c'est exactement par là que
 * l'amnésie passait. Le modèle relisait le même fichier à des fenêtres différentes,
 * ce qui n'a jamais valu quatre signatures identiques pour `ToolLoopDetector` et ne
 * doit pas valoir non plus deux mémoires distinctes ici — un chemin, une lecture.
 *
 * Seuls les tools de LECTURE ont une clé. Un `run_command` n'en a pas : son
 * résultat dépend de l'état du dépôt à l'instant où il a tourné, donc le rejouer
 * n'est pas le même geste que relire un fichier — et le garder indéfiniment
 * mentirait sur un état qui a bougé depuis.
 */
export function toolMemoryKey(name: string, args: Record<string, unknown>): string | null {
  switch (name) {
    case "read_file":
    case "list_dir":
      return `${name}:${String(args.path ?? "")}`;
    case "grep":
      return `grep:${String(args.pattern ?? "")} ${String(args.path ?? "")} ${String(args.glob ?? "")}`;
    case "glob":
      return `glob:${String(args.pattern ?? "")} ${String(args.path ?? "")}`;
    case "read_resource":
    case "read_attachment":
      return `read_resource:${String(args.resource_id ?? args.attachment_id ?? "")}`;
    case "read_issue":
      return `read_issue:${String(args.issue ?? "")}`;
    case "read_feedback":
      return `read_feedback:${String(args.feedback_post_id ?? "")}`;
    case "read_scratchpad":
      return "read_scratchpad";
    default:
      return null;
  }
}

/**
 * Table `tool_call_id → clé de mémoire`, lue de l'HISTORIQUE lui-même : les
 * `tool_calls` des messages assistant portent le nom du tool et ses arguments.
 *
 * Le lire plutôt que le mémoriser au fil des rounds est ce qui le fait survivre au
 * découpage en chunks : un checkpoint rehydraté n'a pas de `Map` en mémoire, mais
 * il a toujours ses `tool_calls`. Un historique repris garderait sinon zéro lecture
 * — précisément le cas des runs longs, ceux que MIN-248 répare.
 */
function toolMemoryKeys(messages: ReadonlyArray<AgentChatMessage>): Map<string, string> {
  const keys = new Map<string, string>();
  for (const m of messages) {
    if (m.role !== "assistant" || !m.tool_calls?.length) continue;
    for (const tc of m.tool_calls) {
      const args = safeParse(tc.function.arguments);
      if (!args) continue;
      const key = toolMemoryKey(tc.function.name, args);
      if (key) keys.set(tc.id, key);
    }
  }
  return keys;
}

/** Erreur rendue DANS le flux (OpenRouter la pose en objet SSE), MIN-203. */
interface StreamErrorPayload {
  code?: number | string;
  message?: string;
}

interface StreamChunk {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
  /** Le provider a lâché EN COURS de stream : le flux se termine sinon
   *  « proprement » sur un round vide, que la boucle lisait comme une fin de tour. */
  error?: StreamErrorPayload;
  choices?: Array<{
    /** Motif d'arrêt du round. `length` = coupé au plafond de tokens (MIN-203). */
    finish_reason?: string | null;
    /** La forme du provider sous la couche compat (`max_tokens` chez Anthropic). */
    native_finish_reason?: string | null;
    error?: StreamErrorPayload;
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
  /** Motif d'arrêt rapporté par le provider, `null` s'il n'en a rendu aucun. */
  finishReason: string | null;
  /** Round COUPÉ au plafond de tokens (MIN-203) : ce n'est pas une fin de tour. */
  truncated: boolean;
}

/** Motifs d'arrêt qui disent « coupé au plafond », toutes couches compat confondues. */
const TRUNCATED_FINISH_REASONS = new Set(["length", "max_tokens"]);

/**
 * Erreur rendue au fil du stream → `StreamError`. Le code des passerelles
 * OpenAI-compatibles reprend les statuts HTTP : on s'en sert pour décider de la
 * reprise, et on reprend par défaut quand il est absent ou non numérique — un
 * hoquet de provider ne doit pas tuer un run, et le wrapper borne les essais.
 */
function streamPayloadError(payload: StreamErrorPayload): StreamError {
  const status = typeof payload.code === "number" ? payload.code : Number(payload.code);
  const known = Number.isFinite(status);
  return new StreamError(
    `LLM stream error${payload.code != null ? ` (${payload.code})` : ""}: ${
      payload.message ?? "no message"
    }`,
    {
      retryable: known ? isRetryableStatus(status) : true,
      ...(known ? { status } : {}),
    },
  );
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
  /**
   * Cet essai est JETÉ après que le fournisseur a répondu (MIN-216) : interruption,
   * stream coupé, erreur en plein flux. Appelé avant que l'exception ne remonte,
   * avec ce qui avait été accumulé — c'est la seule occasion d'en facturer la
   * dépense, puisque l'appelant ne verra jamais de `StreamResult`.
   */
  onAbandoned?: (attempt: AbandonedStream) => Promise<void> | void;
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

  /**
   * L'état accumulé de l'essai, déclaré AU-DESSUS du try (MIN-216) : une sortie
   * par exception doit pouvoir le rendre à `onAbandoned`. Un essai jeté —
   * interruption, flux coupé, erreur en plein stream, ou simplement un essai que
   * la boucle de reprise abandonne pour en relancer un autre — a été FACTURÉ, et
   * c'est la seule occasion de l'écrire au ledger.
   */
  let content = "";
  let reasoning = "";
  let generationId: string | null = null;
  let modelUsed: string | null = null;
  let usageRaw: OpenRouterUsage | null = null;
  /** Le fournisseur a-t-il répondu ? En deçà (4xx/5xx, abort avant les en-têtes),
      rien n'a été produit : il n'y a rien à facturer et rien à écrire. */
  let responded = false;

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

    // Le FOURNISSEUR A RÉPONDU (MIN-216) : le prompt lui est parvenu, donc il est
    // facturé, et la génération existe chez lui — quoi qu'il advienne du flux
    // ensuite. C'est le drapeau que lit le rattrapage de facturation, en bas.
    responded = true;

    const reader = response.body?.getReader();
    if (!reader) throw new StreamError("No response body from LLM", { retryable: true });

    const decoder = new TextDecoder();
    let buffer = "";
    /** Dernier motif d'arrêt vu (MIN-203) — `null` si le provider n'en rend pas. */
    let finishReason: string | null = null;
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
        // Erreur DANS le flux (MIN-203) : sans ça le stream se termine sans rien
        // dire, et un round vide se lisait comme une fin de tour.
        const errorPayload = parsed.error ?? parsed.choices?.[0]?.error;
        if (errorPayload) throw streamPayloadError(errorPayload);
        // AVANT le garde sur `delta` : le chunk qui porte le motif d'arrêt n'a
        // souvent pas de delta du tout, et le garde le sauterait.
        const choice = parsed.choices?.[0];
        const stop = choice?.finish_reason ?? choice?.native_finish_reason;
        if (stop) finishReason = stop;
        const delta = choice?.delta;
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
      finishReason,
      truncated: finishReason !== null && TRUNCATED_FINISH_REASONS.has(finishReason),
    };
  } catch (err) {
    // Essai ABANDONNÉ après réponse du fournisseur (MIN-216) : personne ne verra
    // jamais ce qu'il a produit, mais il est facturé. On le rend à l'appelant
    // pour qu'il l'écrive au ledger, PUIS on relève — l'erreur d'origine porte la
    // décision de reprise, elle ne doit être ni avalée ni remplacée.
    if (responded) {
      try {
        await opts.onAbandoned?.({
          generationId,
          modelUsed,
          usage: parseOpenRouterUsage(usageRaw),
          // Le prompt tel qu'il est PARTI : facturé en entier dès la réponse.
          estimatedPromptTokens: estimateTokens(opts.messages),
          // Ce qu'on a reçu avant la coupure. Minorant : chez un fournisseur qui
          // ne sait pas annuler, la génération continue et sera facturée entière.
          estimatedCompletionTokens: estimateTokensFromChars(content.length + reasoning.length),
        });
      } catch (recordErr) {
        console.error("[agent-loop] onAbandoned failed:", (recordErr as Error).message);
      }
    }
    throw err;
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
  /**
   * Appelé pour CHAQUE essai jeté (MIN-216) — y compris ceux que la reprise
   * remplace en silence. C'est le cas le plus fréquent : un 5xx en plein flux
   * puis un essai qui réussit rendait UNE ligne au ledger là où le fournisseur
   * en avait facturé deux.
   */
  onAbandoned?: (attempt: AbandonedStream) => Promise<void> | void;
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
      //
      // La garde porte sur la TENTATIVE, pas seulement sur le sommeil (MIN-214) : il
      // faut de quoi la FINIR, pas seulement de quoi dormir avant de la lancer. Sans
      // le terme `MIN_STREAM_ATTEMPT_MS`, on repartait avec 2 s de budget pour un
      // appel qui peut en prendre 210 — la fonction était tuée avant le checkpoint,
      // et tout le chunk partait avec. La phase modèle d'un round de fin de fenêtre
      // se ramène ainsi à un seul appel.
      const wait = Math.min(
        (err instanceof StreamError ? err.retryAfterMs : undefined) ?? backoffMs(attempt),
        MAX_RETRY_WAIT_MS,
      );
      if (opts.deadlineAt && Date.now() + wait + MIN_STREAM_ATTEMPT_MS >= opts.deadlineAt) throw err;
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
  const { messages, tools, model, apiKey, baseUrl, runId, execTool, emit, recordUsage } = params;
  /**
   * Les DEUX sorties d'un résultat de tool, secrets substitués (MIN-239) — l'aperçu
   * de l'event et le message rendu au modèle. Toutes les émissions passent par ici :
   * un `previewResult` appelé en direct rouvrirait la fuite sans rien dire.
   */
  const preview = (result: unknown) => previewResult(result, params.redact);
  const toolContent = (result: unknown, images?: AgentToolImage[]) =>
    toolMessageContent(result, images, params.redact);
  const provider = params.provider ?? DEFAULT_AGENT_PROVIDER;
  // La ligne de facture de ce chunk, résolue UNE fois : `agent_code`, ou
  // `routine_code` quand le run est un passage de routine (MIN-185).
  const usageFeature: AiFeature = params.feature ?? "agent_code";
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  // Direct : `emitLive` pendant l'écriture, puis À VIDE dès que les events du
  // round sont posés — le fil bascule alors du texte provisoire aux vrais
  // messages, sans que les deux se superposent une seconde.
  const clearLive = () =>
    params.emitLive?.({ text: "", tools: 0, reasoningActive: false, reasoningMs: 0 });

  let seq = params.usageSeqStart ?? 0;
  /**
   * Ce que CETTE boucle a dépensé — rapports de filles compris. C'est ce qu'elle
   * REND, et ce que l'appelant impute au run. À ne pas confondre avec `spend`
   * ci-dessous : les deux grandeurs se séparent, et c'est voulu.
   */
  let costUsd = 0;
  /**
   * Ce que le CHUNK a dépensé, filles comprises (MIN-202). Partagé avec elles quand
   * l'appelant le fournit ; c'est LUI que `budgetUsd` plafonne. On ne l'incrémente
   * qu'aux endroits où cette boucle paie vraiment un appel (cf. `bill`) — jamais au
   * drain d'un rapport, dont la fille a déjà porté la dépense en la payant.
   */
  const spend = params.chunkSpend ?? { usd: 0 };
  /**
   * Le plafond COURANT, et il n'est pas constant : `refreshBudgetUsd` le recale en
   * cours de route sur ce que le compte a encore (cf. la garde de la boucle). Le
   * snapshot d'entrée n'en est que la première valeur.
   */
  let budgetUsd = params.budgetUsd;
  /**
   * UN appel payé, porté aux trois endroits qui le comptent. Passer par ici plutôt
   * que d'incrémenter à la main : les trois grandeurs ne se séparent jamais, et un
   * quatrième site de paiement en oublierait forcément une.
   *
   * `costUsd` est ce que la boucle REND à l'appelant, `spend.usd` ce que le plafond
   * du chunk oppose aux filles, et `onSpend` ce qui est dit TOUT DE SUITE à qui
   * suit cette boucle de l'extérieur — le seul des trois qui n'attende pas qu'elle
   * rende la main. C'est ce qui fait vivre la dépense d'un sous-agent : sa promesse
   * peut ne jamais se résoudre à temps (cf. `onSpend` dans les params).
   */
  const bill = (cost: number | null | undefined) => {
    const usd = cost ?? 0;
    costUsd += usd;
    spend.usd += usd;
    params.onSpend?.(usd);
  };

  /**
   * Un essai de stream JETÉ (MIN-216) — « Stop » de l'utilisateur, flux coupé,
   * erreur en plein stream, ou essai remplacé par une reprise. Le fournisseur a
   * répondu, donc il a facturé, et jusqu'ici cette dépense n'écrivait AUCUNE
   * ligne : ni au quota du compte, ni au plafond du run (que MIN-215 lit au
   * ledger), ni à la facture — sur un geste que l'utilisateur peut répéter à
   * volonté.
   *
   * La ligne s'écrit donc ici, exactement comme sur le chemin sain : même `seq`,
   * même `feature`, même imputation. Son coût vient du fournisseur s'il a eu le
   * temps de le rendre, sinon du prix publié × les tokens observés — marqué
   * `estimated` pour ne jamais se lire comme un chiffre relevé. Hors OpenRouter
   * il n'y a pas d'index de prix : la ligne porte alors ses tokens et son id de
   * génération, sans coût (un BYOK n'entre de toute façon dans aucun plafond).
   */
  const recordAbandonedAttempt = async (attempt: AbandonedStream) => {
    const info =
      provider === "openrouter"
        ? await getOpenRouterModelInfo(attempt.modelUsed ?? model, apiKey).catch(() => null)
        : null;
    const spent = abandonedSpend(attempt, info?.pricing ?? null);
    await recordUsage({
      runId,
      seq: seq++,
      feature: usageFeature,
      model: attempt.modelUsed ?? model,
      generationId: attempt.generationId,
      promptTokens: spent.promptTokens,
      completionTokens: spent.completionTokens,
      totalTokens: spent.totalTokens,
      cost: spent.cost,
      estimated: spent.estimated,
      billTo: params.billTo,
      projectId: params.projectId ?? null,
    });
    // Facturé comme un appel abouti : le fournisseur a répondu, donc il a facturé.
    bill(spent.cost);
  };

  let round = 0;
  // Compactions consommées dans la FENÊTRE de rounds courante, et l'index de cette
  // fenêtre (cf. MAX_COMPACTIONS_PER_WINDOW). Le troisième drapeau ne borne rien :
  // il fait juste parler le franchissement une seule fois par fenêtre.
  let compactions = 0;
  let compactionWindow = 0;
  let compactionQuotaReported = false;
  // Relances du tour sur une réponse coupée ou vide (MIN-203). Compté par CHUNK,
  // comme celui au-dessus.
  let incompleteReentries = 0;
  // Relances du tour pour livrer un rapport de sous-agent (MIN-112) — budget PROPRE,
  // cf. MAX_SUBAGENT_WAIT_REENTRIES.
  let subagentReentries = 0;
  // Tour repris en ATTENTE de ses filles : on attend avant le premier appel LLM,
  // une seule fois (le drapeau retombe dès qu'on est passé).
  let parked = params.parkedForSubagents === true;
  // Plafond de rounds de cette boucle : celui du chunk par défaut, plus serré pour
  // une boucle fille (MIN-112).
  const maxRounds = params.maxRounds ?? MAX_ROUNDS_PER_CHUNK;
  // Détection de boucle (MIN-243) : fenêtre glissante sur `nom + args + RÉSULTAT`
  // des appels joués. Propre à cette boucle, donc à ce chunk — et une fille a la
  // sienne.
  const toolLoop = new ToolLoopDetector();
  // Seuil de compaction, dérivé du MODÈLE : ce qui plafonne une session longue est
  // le coût de renvoyer l'historique à chaque round, pas la fenêtre (MIN-113) — et
  // ce coût-là dépend du prix d'entrée. L'arithmétique et ses trois bornes vivent
  // dans `agentCompactThreshold`, pure et testée.
  const compactThreshold = agentCompactThreshold({
    contextWindow: params.contextWindow,
    inputUsdPerMTok: params.inputUsdPerMTok,
  });
  // Taille de contexte réelle du dernier appel (prompt_tokens rapportés) — plus
  // fiable que l'estimation caractères/4 pour décider de compacter.
  let lastPromptTokens: number | null = null;

  /**
   * Tool-call aux `arguments` illisibles (MIN-204) : on RÉPOND à l'appel — son
   * appariement dans le checkpoint doit rester intact — sans jamais atteindre
   * `execTool`. Le fil montre un appel EN ÉCHEC au lieu d'un ✓ sans sortie, et
   * le modèle réémet simplement l'appel au round suivant. Même geste que Codex
   * (`FunctionCallError::RespondToModel`) et OpenCode (`Invalid tool input`).
   */
  const rejectUnparsableArgs = async (tc: AssistantToolCall) => {
    const error = `failed to parse function arguments: ${argsParseError(tc.function.arguments)}`;
    // Le `tool_call` d'abord : le feed rattache un `tool_result` à l'appel du
    // même id, et sans lui l'échec ne s'afficherait nulle part.
    await emit("tool_call", { id: tc.id, name: tc.function.name, ...toolArgSummary(tc.function.name, {}) });
    messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error }) });
    await emit("tool_result", {
      id: tc.id,
      name: tc.function.name,
      success: false,
      preview: preview({ error }),
    });
  };

  /**
   * Tool-call NON EXÉCUTÉ (MIN-214) : la soft-deadline est tombée ENTRE deux appels
   * du même round. Même geste que ci-dessus, et pour la même raison — on RÉPOND à
   * l'appel. Le laisser sans réponse casserait l'appariement du checkpoint, et le
   * chunk suivant repartirait sur un historique que le provider refuse.
   *
   * Le modèle relancera l'appel au chunk suivant : la réponse le lui dit, plutôt que
   * de lui laisser croire que sa commande a échoué.
   */
  const skipForSuspend = async (tc: AssistantToolCall) => {
    const error = TOOL_NOT_EXECUTED_NOTE;
    // Les arguments servent au seul résumé du fil : illisibles, l'appel n'a de toute
    // façon pas été joué — il n'a pas à passer par le refus de MIN-204.
    const args = safeParse(tc.function.arguments) ?? {};
    await emit("tool_call", { id: tc.id, name: tc.function.name, ...toolArgSummary(tc.function.name, args) });
    messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error }) });
    await emit("tool_result", {
      id: tc.id,
      name: tc.function.name,
      success: false,
      preview: preview({ error }),
      reason: SUSPENDED_TOOL_REASON,
    });
  };

  /**
   * Le modèle tourne en rond (MIN-243) : le même appel, les mêmes arguments et le
   * MÊME résultat, quatre fois dans les dix derniers appels. Le tour s'arrête EN
   * LE DISANT, et il s'arrête franchement — Crush et OpenCode, eux, peuvent
   * demander à l'humain « je continue ? » ; nous non, une routine tourne à 3 h du
   * matin et une chaîne d'automatisation n'a personne au bout.
   *
   * `status: "error"` prend le chemin de `replyIncomplete` (MIN-203) : repos
   * REPRENABLE, checkpoint gardé, ni commit ni push, et pas de `summary`
   * mensonger. L'utilisateur peut relancer d'un message — ce qui est coupé, c'est
   * la dépense, pas le travail déjà fait.
   */
  const cutForToolLoop = async (name: string): Promise<AgentLoopResult> => {
    clearLive();
    const message = `The model kept repeating the same ${name} call with the same result.`;
    await emit("error", { code: "toolLoop", name, message });
    return { status: "error", messages, errorMessage: message, costUsd, usageSeqEnd: seq, rounds: round };
  };

  for (;;) {
    // Interruption demandée entre deux rounds → repos, SANS round partiel (le
    // checkpoint reste au dernier round complet).
    if (params.checkInterrupt && (await params.checkInterrupt())) {
      return { status: "interrupted", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    // Frontière sûre : suspend AVANT le prochain appel LLM.
    if (elapsed() >= params.softDeadlineMs || round >= maxRounds) {
      return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    /**
     * LE PLAFOND SE RELIT, il n'est pas seulement snapshoté (MIN-224).
     *
     * Rien ne réserve de budget : deux runs concurrents lisent le même restant et
     * le prennent chacun pour plafond. Ce qui borne la casse, c'est la fréquence
     * de relecture — d'où ce crochet, appelé à la frontière de round, avant la
     * garde ci-dessous pour que le restant frais morde DÈS ce round-ci.
     *
     * `spend.usd + restant` : le crochet rend ce qu'on a encore le droit de
     * dépenser, la garde compare des dépenses de tour. Ça recale aussi le retard
     * du ledger — le restant relu tient compte de ce que ce tour a déjà écrit.
     */
    if (params.refreshBudgetUsd) {
      const fresh = await params.refreshBudgetUsd();
      if (fresh !== null) budgetUsd = spend.usd + Math.max(0, fresh);
    }
    // Budget d'usage épuisé (quota minddy) — MÊME frontière que la soft-deadline,
    // même raison : on ne paie pas un appel de plus. C'est bien `spend` et pas
    // `costUsd` qu'on compare (MIN-202) : le compteur est PARTAGÉ avec les filles,
    // sans quoi chacune opposerait sa seule dépense au plafond commun et le chunk
    // entier pourrait le franchir autant de fois qu'il y a de boucles. Le round en
    // cours peut dépasser légèrement (on ne coupe jamais un appel en vol) — c'est
    // la politique assumée de lib/server/usage.ts, comme chez Claude/ChatGPT.
    if (budgetUsd !== undefined && spend.usd >= budgetUsd) {
      clearLive();
      return { status: "budget_exhausted", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    round++;

    /**
     * Matière neuve entrée dans l'historique à ce round, quelle qu'en soit la
     * source — message de l'utilisateur OU rapport de fille. Unique lecteur : la
     * garde du parking, plus bas. C'est pourquoi il se déclare AVANT le steering
     * (MIN-205) : un message compté seulement à partir du bloc des rapports ne
     * levait pas le parking, et le parent passait le chunk entier à attendre ses
     * filles sans un seul appel au modèle — message accepté, affiché, puis
     * silence de plusieurs dizaines de minutes.
     */
    let injectedThisRound = 0;

    // Steering : draine les messages user en attente et les injecte comme messages
    // `user` AVANT le prochain appel (frontière sûre, aucun appel en vol). Sert à
    // orienter un run en cours ET à répondre à un `ask_user` (reprise du run).
    if (params.pullSteering) {
      const injected = await params.pullSteering();
      for (const text of injected) {
        if (!text.trim()) continue;
        messages.push({ role: "user", content: text });
        injectedThisRound++;
        await emit("user_message", { text: cap(text, 4000) });
      }
    }

    // Wakeup des sous-agents (MIN-112) : MÊME frontière, MÊME mécanique que le
    // steering — les rapports terminés entrent comme messages `user` avant l'appel.
    // Pas de bulle par rapport : le bloc replié du sous-agent raconte déjà le détail
    // dans le fil, un event `status` suffit à le marquer.
    if (params.pullSubagentReports) {
      const reports = await params.pullSubagentReports().catch(() => []);
      for (const report of reports) {
        messages.push({ role: "user", content: report.text });
        costUsd += report.costUsd;
        injectedThisRound++;
        await emit("status", { phase: "subagent_report", id: report.id });
      }
    }

    // Tour GARÉ repris (MIN-112) : le parent avait déjà répondu et attend ses
    // filles. On attend ICI, avant tout appel LLM — le faire parler pour qu'il
    // redise « j'attends » coûterait un aller-retour par chunk d'attente.
    // `injectedThisRound` garde le parking : si un rapport OU un message de
    // l'utilisateur attendait déjà, le parent a quelque chose à dire — le garer de
    // nouveau lui ferait rater son tour de parole et retarderait la réponse d'un
    // chunk entier. Pour un message, l'attente ne pourrait même plus tomber :
    // `hasPendingRunMessages` (la sonde qui la rompt) ne voit que les messages NON
    // consommés, et le drain vient précisément de le marquer consommé.
    if (parked && injectedThisRound === 0 && params.awaitSubagents) {
      parked = false;
      const waited = await params
        .awaitSubagents({ budgetMs: params.softDeadlineMs - elapsed() })
        .catch(() => null);
      // Les rapports d'ABORD, la décision de suspendre ENSUITE (MIN-208) : sur le
      // chemin `suspend`, ceux-ci sont les rapports PARTIELS des filles qui n'ont pas
      // su se sauver et qu'on vient de couper. `drainReports()` les a déjà marqués
      // livrés ET facturés — retourner sans les jouer les perdait pour de bon, texte
      // et coût compris, alors que la fille avait travaillé et que le run avait payé.
      // Joués ici, ils partent dans `messages` (donc dans le checkpoint, livrés au
      // chunk suivant) et leur coût dans `costUsd`.
      for (const report of waited?.reports ?? []) {
        messages.push({ role: "user", content: report.text });
        costUsd += report.costUsd;
        injectedThisRound++;
        await emit("status", {
          phase: "subagent_report",
          id: report.id,
          ...(waited?.suspend ? { partial: true } : {}),
        });
      }
      if (waited?.suspend) {
        return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
      }
    } else if (parked) {
      // Un rapport attendait : le tour n'est plus garé, il reprend la parole.
      parked = false;
    }

    // Durcissement : élague les sorties de tools périmées (protège les ~400 Ko
    // récents, plus la dernière lecture de chaque chemin). Réduit le coût par appel
    // et la taille du checkpoint.
    //
    // SOUS PRESSION SEULEMENT (MIN-248). Élaguer à chaque round, inconditionnellement,
    // faisait de l'hygiène une panne : le harness bornait la mémoire d'outils à
    // ~10 k tokens pendant que la compaction attendait 120 k, et c'est le plus serré
    // des deux qui gouvernait — sans jamais laisser l'autre entrer en jeu. Le seuil
    // est celui du préavis de contexte : trois paliers dans l'ordre (élagage,
    // préavis, compaction) au lieu de deux qui se marchent dessus.
    if ((lastPromptTokens ?? estimateTokens(messages)) >= compactThreshold * CONTEXT_WARNING_RATIO) {
      const keys = toolMemoryKeys(messages);
      pruneToolOutputs(messages, {
        keepLastPerKey: (m) => (m.tool_call_id ? (keys.get(m.tool_call_id) ?? null) : null),
      });
    }

    // Même hygiène pour les IMAGES (MIN-111) : on garde les plus récentes et on
    // remplace les plus anciennes par une note re-demandable. Une maquette pèse en
    // data URL bien plus que ce qu'elle coûte en tokens — sans ce plafond, c'est le
    // CHECKPOINT (8 Mo) qu'elle finirait par remplir, pas la fenêtre du modèle.
    capHistoryImages(messages);

    // Compaction : si l'historique reste énorme après élagage et qu'il reste du
    // budget, résume le milieu périmé en un message unique (préserve système +
    // queue récente). Rare — ne se déclenche que sur les runs très longs.
    //
    // Le quota se recharge par fenêtre de rounds (MIN-259) : le round vient d'être
    // incrémenté, il est donc 1-based.
    const windowNow = Math.floor((round - 1) / COMPACTION_WINDOW_ROUNDS);
    if (windowNow !== compactionWindow) {
      compactionWindow = windowNow;
      compactions = 0;
      compactionQuotaReported = false;
    }
    const wantsCompaction =
      params.softDeadlineMs - elapsed() > AGENT_COMPACT_MIN_BUDGET_MS &&
      (lastPromptTokens ?? estimateTokens(messages)) >= compactThreshold;
    if (wantsCompaction && compactions >= MAX_COMPACTIONS_PER_WINDOW && !compactionQuotaReported) {
      // Le franchissement était SILENCIEUX : le bloc était sauté sans rien dire, et
      // la seule question qui compte — « est-ce que ce quota mord ? » — n'avait pas
      // de réponse en base. Une fois par fenêtre suffit à la donner.
      compactionQuotaReported = true;
      await emit("status", {
        phase: "compact_quota_exhausted",
        round,
        window: compactionWindow,
        max: MAX_COMPACTIONS_PER_WINDOW,
        tokens: lastPromptTokens ?? estimateTokens(messages),
        threshold: compactThreshold,
      });
    }
    if (wantsCompaction && compactions < MAX_COMPACTIONS_PER_WINDOW) {
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
            onAbandoned: recordAbandonedAttempt,
          });
          await recordUsage({
            runId,
            seq: seq++,
            feature: usageFeature,
            model: summaryStream.modelUsed ?? model,
            generationId: summaryStream.generationId,
            promptTokens: summaryStream.usage.promptTokens,
            completionTokens: summaryStream.usage.completionTokens,
            totalTokens: summaryStream.usage.totalTokens,
            cachedTokens: summaryStream.usage.cachedTokens,
            cacheWriteTokens: summaryStream.usage.cacheWriteTokens,
            cost: summaryStream.usage.cost,
            billTo: params.billTo,
            projectId: params.projectId ?? null,
          });
          bill(summaryStream.usage.cost);

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
    //
    // « Déjà prévenu ? » se lit dans l'historique et jamais dans une variable
    // (MIN-218, cf. `hasContextWarning`) : le scan ne coûte que quand le seuil est
    // franchi, et il est le seul à survivre au découpage en chunks.
    //
    // Et il reste muet quand le quota de compaction est épuisé, DÉLIBÉRÉMENT
    // (MIN-259) : le préavis est déjà dans le contexte, sous les yeux du modèle à
    // chaque appel — le redire ne lui apprend rien et pousse un tour à conclure. Ce
    // qui rend le quota visible, c'est l'event `compact_quota_exhausted` ci-dessus,
    // pas un message de plus au modèle.
    const contextNow = lastPromptTokens ?? estimateTokens(messages);
    if (contextNow >= compactThreshold * CONTEXT_WARNING_RATIO && !hasContextWarning(messages)) {
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
          onAbandoned: recordAbandonedAttempt,
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
        //
        // Suspension NOMMÉE (MIN-219) : ce chunk n'a rien fait avancer, il a attendu
        // un fournisseur qui n'a pas répondu. L'exécuteur en tire un re-queue DIFFÉRÉ
        // et hors budget de continuations — rendue anonyme, cette sortie se re-queuait
        // aussitôt, vingt fois, et le tour mourait sur un message parlant de durée.
        if (err instanceof StreamError && err.retryable) {
          clearLive();
          await emit("status", { phase: "transient_error", message: cap(err.message, 300) });
          return {
            status: "suspended",
            suspendReason: "transient_error",
            messages,
            errorMessage: cap(err.message, 1000),
            costUsd,
            usageSeqEnd: seq,
            rounds: round,
          };
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

    await recordUsage({
      runId,
      seq: seq++,
      feature: usageFeature,
      model: stream.modelUsed ?? model,
      generationId: stream.generationId,
      promptTokens: stream.usage.promptTokens,
      completionTokens: stream.usage.completionTokens,
      totalTokens: stream.usage.totalTokens,
      cachedTokens: stream.usage.cachedTokens,
      cacheWriteTokens: stream.usage.cacheWriteTokens,
      cost: stream.usage.cost,
      billTo: params.billTo,
      projectId: params.projectId ?? null,
    });
    bill(stream.usage.cost);
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
      /**
       * …mais un arrêt n'est pas toujours naturel (MIN-203). Deux formes disent
       * l'inverse, et toutes deux arrivaient ici comme une conclusion :
       *
       * - le round a été COUPÉ au plafond de tokens (`finish_reason: "length"`) ;
       * - il est revenu VIDE, ni texte ni tool-call — ce que le repli « Done. »
       *   masquait exactement.
       *
       * Les prendre pour une fin de tour coûtait cher : `commitAndPush` partait
       * avec un commit intitulé « Done. », l'arbre à moitié écrit était poussé, et
       * l'`outcome` stampé devenait le résumé qu'une session froide relira.
       *
       * Testé EN TÊTE de branche : un tour qui n'est pas fini n'a pas à réveiller
       * ses filles ni à déclencher le type-check de fin de tour.
       */
      const incomplete = stream.truncated || !stream.content.trim();
      if (incomplete && incompleteReentries < MAX_INCOMPLETE_REENTRIES) {
        incompleteReentries++;
        // Le fragment reste dans le contexte pour que le modèle le CONTINUE, et
        // dans le fil comme étape (même convention que les autres relances) —
        // sans clore le tour à l'écran.
        if (stream.content.trim()) {
          messages.push({ role: "assistant", content: stream.content });
          await emit("thinking", { text: cap(stream.content, 2000) });
        }
        messages.push({
          role: "user",
          content: stream.truncated ? TRUNCATED_NUDGE : EMPTY_REPLY_NUDGE,
        });
        await emit("status", { phase: "reply_incomplete", truncated: stream.truncated });
        clearLive();
        continue;
      }
      if (incomplete) {
        // Plafond épuisé : le tour s'arrête EN LE DISANT. `status: "error"` prend
        // le chemin de `turnTooLong` — repos reprenable, checkpoint gardé, ni
        // commit ni push, et pas d'`outcome` mensonger. Surtout : pas de `summary`.
        if (stream.content.trim()) messages.push({ role: "assistant", content: stream.content });
        clearLive();
        const message = stream.truncated
          ? "The model's reply kept being cut off at the token limit."
          : "The model kept returning an empty reply.";
        await emit("error", { code: "replyIncomplete", message });
        return {
          status: "error",
          messages,
          errorMessage: message,
          costUsd,
          usageSeqEnd: seq,
          rounds: round,
        };
      }

      messages.push({ role: "assistant", content: stream.content });
      // Non vide par construction : un contenu blanc est `incomplete`, traité
      // au-dessus. C'est ce qui a retiré le repli « Done. » — il ne couvrait pas
      // un cas rare, il maquillait un round raté en conclusion.
      const reply = stream.content.trim();

      // Sous-agents encore en vol (MIN-112) : le tour ne se termine pas tant qu'une
      // fille peut encore rendre son rapport DANS ce chunk. Placé AVANT le
      // type-check : les éditions d'un `implement` doivent être dans `editedPaths`
      // et dans le diff avant que diagnostics.ts et self-review.ts ne parlent —
      // sinon un sous-agent casse les types en silence.
      if (params.awaitSubagents && subagentReentries < MAX_SUBAGENT_WAIT_REENTRIES) {
        const waited = await params
          .awaitSubagents({ budgetMs: params.softDeadlineMs - elapsed() })
          .catch(() => null);
        // Plus de budget mais une fille travaille encore, son état sauvé : on
        // SUSPEND le tour au lieu de le terminer. L'appelant persiste et re-queue ;
        // la fille repart au chunk suivant, et le parent la retrouve garée.
        //
        // Mais on joue D'ABORD les rapports que l'attente vient de rendre (MIN-208) :
        // sur ce chemin, ce sont les rapports PARTIELS des filles qui n'ont pas su se
        // sauver et qu'on vient de couper. `drainReports()` les a déjà marqués livrés
        // ET facturés — sortir sans les jouer les perdait pour de bon. Ils partent
        // donc dans `messages` (checkpoint → chunk suivant) et leur coût dans
        // `costUsd`. Pas de `subagentReentries++` ici : le tour ne repart pas, il sort.
        if (waited?.suspend) {
          for (const report of waited.reports) {
            messages.push({ role: "user", content: report.text });
            costUsd += report.costUsd;
            await emit("status", { phase: "subagent_report", id: report.id, partial: true });
          }
          clearLive();
          return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
        }
        // Le tour repart si une fille a rendu son rapport, OU si l'utilisateur a
        // écrit pendant l'attente (son message est drainé au sommet du round).
        if (waited && (waited.reports.length > 0 || waited.interrupted)) {
          subagentReentries++;
          if (stream.content.trim()) await emit("thinking", { text: cap(stream.content, 2000) });
          for (const report of waited.reports) {
            messages.push({ role: "user", content: report.text });
            costUsd += report.costUsd;
            await emit("status", { phase: "subagent_report", id: report.id });
          }
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
      // Args parsés UNE fois pour les deux passes. Les illisibles sortent du
      // `Promise.all` : ils ne touchent pas le Sandbox, et leur réponse est
      // poussée dans l'ordre d'origine comme les autres.
      const parsed = stream.toolCalls.map((tc) => ({ tc, args: safeParse(tc.function.arguments) }));
      for (const { tc, args } of parsed) {
        if (!args) continue;
        await emit("tool_call", { id: tc.id, name: tc.function.name, ...toolArgSummary(tc.function.name, args) });
      }
      const outcomes = await Promise.all(
        parsed.map(async ({ tc, args }) => {
          if (!args) return { tc, args };
          try {
            const { result, success, reason, images, edit } = await execTool(
              tc.function.name,
              args,
              tc.id,
            );
            return { tc, args, result, success, reason, images, edit };
          } catch (err) {
            return {
              tc,
              args,
              result: { error: err instanceof Error ? err.message : String(err) },
              success: false,
              reason: undefined,
              images: undefined,
              edit: undefined,
            };
          }
        }),
      );
      let loopingTool: string | null = null;
      for (const o of outcomes) {
        if (!o.args) {
          await rejectUnparsableArgs(o.tc);
          continue;
        }
        messages.push({ role: "tool", tool_call_id: o.tc.id, content: toolContent(o.result, o.images) });
        await emit("tool_result", {
          id: o.tc.id,
          name: o.tc.function.name,
          success: o.success,
          preview: preview(o.result),
          ...(o.reason ? { reason: o.reason } : {}),
          ...(o.edit ? { edit: o.edit } : {}),
        });
        if (toolLoop.record(o.tc.function.name, o.args, o.result)) {
          loopingTool ??= o.tc.function.name;
        }
      }
      // Coupure APRÈS la boucle : chaque tool-call du round a sa réponse, donc
      // l'appariement du checkpoint reste intact (même invariant que MIN-214).
      if (loopingTool) return await cutForToolLoop(loopingTool);
      continue;
    }

    // ask_user (MIN-86) : levé quand le round a posé des questions valides → le
    // tour se termine après l'exécution de TOUS les tool-calls du round (chaque
    // appel garde sa réponse : l'appariement du checkpoint reste intact).
    let askedUser = false;
    /**
     * Frontière de suspension ENTRE deux tool-calls (MIN-214). La garde du sommet de
     * round ne décide que d'ENTRER dans un round : un round entamé juste avant la
     * soft-deadline pouvait enchaîner plusieurs appels, et la fonction mourait au
     * milieu — checkpoint jamais écrit, chunk entier perdu.
     *
     * Ici, la sortie est PROPRE : les appels déjà joués ont leur réponse dans
     * `messages`, les restants reçoivent une note « pas exécuté », l'appariement est
     * donc intact et le chunk suivant reprend là.
     *
     * `executed > 0` est l'invariant qui compte : on ne suspend jamais AVANT d'avoir
     * joué au moins un appel. Sinon un chunk court reviendrait indéfiniment poser sa
     * question au modèle sans jamais rien exécuter — le zombie fermé par MIN-213,
     * repeuplé sur l'axe des tool-calls.
     */
    let executed = 0;
    let suspendAtBoundary = false;
    /** Tool dont la répétition a été confirmée dans ce round (MIN-243) : la
     *  coupure attend la fin du round, où chaque appel a sa réponse. */
    let loopingTool: string | null = null;
    /** Ce que le harness a de LONG à dire sur un appel de ce round (MIN-247) : le
     *  diff rendu par la porte de `create_pr`. Un résultat de tool est capé à
     *  `TOOL_RESULT_MAX_CHARS` avec le MILIEU élidé — ce qui d'un diff de
     *  relecture couperait précisément ce qu'on donne à lire. Ça part donc en
     *  message `user`, comme la relance de fin de tour, et APRÈS le round : les
     *  réponses aux tool-calls doivent rester contiguës. */
    const followUps: string[] = [];

    for (const tc of stream.toolCalls) {
      if (suspendAtBoundary || (executed > 0 && elapsed() >= params.softDeadlineMs)) {
        suspendAtBoundary = true;
        await skipForSuspend(tc);
        continue;
      }
      executed++;
      const name = tc.function.name;
      const args = safeParse(tc.function.arguments);

      // Args illisibles (MIN-204) : AVANT tout le reste — un `update_plan` ou un
      // `ask_user` aux arguments tronqués ne vaut pas mieux qu'un `run_command`.
      if (!args) {
        await rejectUnparsableArgs(tc);
        continue;
      }

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
      let edit: EditTelemetry | undefined;
      let followUp: string | undefined;
      try {
        ({ result, success, reason, images, edit, followUp } = await execTool(name, args, tc.id));
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        success = false;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: toolContent(result, images) });
      if (followUp?.trim()) followUps.push(followUp);
      await emit("tool_result", {
        id: tc.id,
        name,
        success,
        preview: preview(result),
        ...(reason ? { reason } : {}),
        ...(edit ? { edit } : {}),
      });
      if (toolLoop.record(name, args, result)) loopingTool ??= name;
    }

    // Boucle confirmée (MIN-243) : on coupe ici, à la frontière du round — tous
    // les tool-calls ont leur réponse. AVANT `ask_user` et avant la suspension :
    // ces deux-là promettent une reprise, et reprendre est exactement ce qu'il ne
    // faut pas faire d'un tour qui tourne en rond.
    if (loopingTool) return await cutForToolLoop(loopingTool);

    // Le mot long du harness, une fois TOUS les tool-calls du round répondus : un
    // message `user` intercalé entre deux réponses casserait l'appariement.
    for (const text of followUps) messages.push({ role: "user", content: text });

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
    // Deadline tombée au milieu du round (MIN-214) : tous les tool-calls ont leur
    // réponse, donc c'est un point de reprise sûr. Testé APRÈS `ask_user` : un tour
    // qui a posé sa question repose de toute façon, et la question est déjà partie.
    if (suspendAtBoundary) {
      clearLive();
      return { status: "suspended", messages, costUsd, usageSeqEnd: seq, rounds: round };
    }
    // on reboucle (le tour ne se termine que sur une réponse sans tool-call)
  }
}
