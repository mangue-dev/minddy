import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { forgeActorValue } from "@/lib/pr-events";
import { getAccountSettings } from "@/lib/server/account-settings";
import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { defaultLocale, type Locale } from "@/i18n/config";
import { DEFAULT_NUMO_STATUS, type NumoDefaultStatus } from "@/lib/numo-default-status";
import { AGENT_MAX_CONTINUATIONS } from "@/lib/agent-models";
import { CHUNK_FLOOR_MS, chunkSoftDeadlineMs, runCommandTimeoutMs } from "./chunk-budget";
import { resolveRepoCloneTarget, type RepoCloneTarget } from "./repo-access";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { getGithubBotCommitIdentity } from "@/lib/server/git/github-app";
import {
  getOrCreateAgentSandbox,
  cloneRepo,
  clonePullRequest,
  commitAndPush,
  revParseHead,
  changedFiles,
  runShell,
  turnDiff,
  readWorkFile,
  readWorkFileWindow,
  writeWorkFile,
  moveWorkFile,
  deleteWorkFile,
  listDir,
  grepRepo,
  globRepo,
  sandboxName,
  writeToolOutput,
  startBackground,
  readBackgroundSince,
  stopBackground,
  REPO_DIR,
  type GrepOutputMode,
  type Sandbox,
} from "./sandbox";
import {
  BackgroundJobs,
  BACKGROUND_FETCH_BYTES,
  type BackgroundJobRunner,
} from "./background";
import {
  Subagents,
  isResumableSubagent,
  subagentUsageSeq,
  MAX_SUBAGENTS_PER_CHUNK,
  type SubagentRunner,
  type SubagentRunResult,
} from "./subagent";
import {
  chunkFitsSubagentResume,
  getSubagentFavorites,
  makeSubagentModelResolver,
  scopeSubagentModels,
  maxParallelSubagents,
  subagentRoundsLeft,
  SUBAGENT_MAX_ROUNDS,
  SUBAGENT_MIN_MS,
  SUBAGENT_PARENT_RESERVE_MS,
} from "./subagent-config";
import { getAgentModelsForUser } from "./models-catalog";
import { pruneToolOutputs } from "./prune";
import { resolveWithin } from "./repo-path";
import { typeErrorsForTurn, TYPECHECK_MIN_BUDGET_MS } from "./diagnostics";
import { formatSelfReview, SELF_REVIEW_MIN_BUDGET_MS } from "./self-review";
import { LITERAL_RETRY_NOTE } from "./grep-pattern";
import {
  formatRunCommandResult,
  fullOutputDocument,
  spillsToDisk,
  toolOutputFileName,
} from "./command-output";
import { checkCommand, FORBIDDEN_COMMAND_REASON } from "./command-guard";
import { applyEdit } from "./edit";
import { applyPatchEdits, parsePatch, usesApplyPatch, type PatchOp } from "./patch";
import {
  REPO_INSTRUCTION_FILES,
  collectTouchedInstructions,
  formatBootInstructions,
  type InstructionsState,
  type RepoInstructionFile,
} from "./repo-instructions";
import {
  runAgentLoop,
  type AgentChatMessage,
  type EmitAgentEvent,
  type EmitAgentLive,
  type ExecuteAgentTool,
} from "./agent-loop";
import type { AgentToolImage } from "./content";
import { broadcastRunStream } from "./live";
import {
  agentToolsFor,
  subagentToolsFor,
  SUBAGENT_CONTROL_TOOLS,
  RUN_COMMAND_TIMEOUT_MS,
} from "./tools";
import {
  isWebSearchEnabled,
  runWebSearchTool,
  MAX_WEB_SEARCHES_PER_TURN,
  WEB_SEARCH_SEQ_BASE,
} from "@/lib/server/web-search";
import {
  buildAgentSystemPrompt,
  buildSubagentSystemPrompt,
  buildAgentContextMessage,
  buildNotebookContextMessage,
  buildInheritedPrMessage,
  buildInheritedBranchMessage,
  buildPrReviewContextMessage,
  toPrLineThreads,
  type AgentAnchor,
  type AgentRepoContext,
  type AgentResourceContext,
} from "./prompt";
import {
  loadPrReviewBoot,
  loadPrRunContext,
  pullRequestHeadRef,
  pullRequestLocalBranch,
} from "./pr-run";
import {
  executePrTool,
  PR_TOOL_NAMES,
  type PrToolContext,
  type ReviewableFile,
} from "./pr-tools";
import { resolveAgentApiKey, getModelContextWindow, supportsImageInput } from "./model";
import { forgeFor, isForgeApiError, type Forge } from "./forge";
import { prStateFromRef, upsertPullRequest } from "./pull-requests";
import { notifyPullRequestOpened } from "./pr-opened-notify";
import type { PullRequestRef } from "./pr";
import type { RepoProviderId } from "@/lib/repo-providers";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { syncIssuePlanStates } from "./plan-sync";
import { executeIssueTool, ISSUE_TOOL_NAMES, type IssueToolContext } from "./issue-tools";
import {
  executeScratchpadTool,
  SCRATCHPAD_TOOL_NAMES,
  type ScratchpadToolContext,
} from "./scratchpad-tools";
import {
  stampRun,
  getRun,
  appendEvent,
  pullPendingMessages,
  previousRunSummaryForIssue,
  branchHasPriorRun,
  readInterruptFlag,
  clearInterrupt,
  hasPendingRunMessages,
  notifyAgentRun,
  type AgentRun,
  type AgentCheckpoint,
} from "./runs";
import { checkAgentQuota } from "./quota";
/** Le plus serré des plafonds fournis (les absents ne bornent rien). */
function minDefined(...values: (number | undefined)[]): number | undefined {
  const defined = values.filter((v): v is number => v != null && Number.isFinite(v));
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

/**
 * Exécute UN chunk d'un RUN d'agent (MIN-46 + MIN-68, modèle CONVERSATIONNEL).
 * Réveille (snapshot persistant) ou clone le Sandbox, rehydrate le checkpoint,
 * fait tourner la boucle jusqu'à la soft-deadline, puis :
 *   - suspended  → commit+push WIP, checkpoint persisté, run re-`queued` (continue
 *                  le tour, en process ou via l'auto-invoke) ;
 *   - completed  → fin de tour NATURELLE (l'agent a répondu) : commit+push de ce
 *                  qui a changé. AUCUNE PR n'est créée ici — si la session en suit
 *                  déjà une, le push l'a mise à jour (et on la ROUVRE si elle avait
 *                  été refusée) ; en créer une est la décision de l'agent (tool
 *                  `create_pr`) ou de l'utilisateur. Run → `completed` (repos).
 *   - interrupted / erreur LLM → même REPOS `completed` (checkpoint conservé,
 *                  error_message le cas échéant) : la session attend simplement le
 *                  prochain message de l'utilisateur.
 * Au repos, une session ne bloque PLUS le ticket : seuls queued/running comptent
 * comme « un agent travaille ». Elle reste reprennable à CHAUD depuis le composer
 * de sa conversation (checkpoint + snapshot conservés).
 * Seule une erreur d'AMORÇAGE (repo/modèle) → `failed`. Le drain appelle après claim.
 */

/**
 * Identité git des commits de l'agent, selon le forge. Côté GitHub on commit sous
 * le bot de l'App (`<slug>[bot]`, rattachable à un vrai compte GitHub) — sinon le
 * contrôle d'auteur de Vercel bloque le déploiement. Ailleurs, identité générique.
 */
async function resolveCommitterIdentity(
  target: RepoCloneTarget,
): Promise<{ name: string; email: string }> {
  if (target.provider === "github") {
    return getGithubBotCommitIdentity(target.token);
  }
  return { name: "minddy agent", email: "agent@minddy.app" };
}

/** Wall-clock max d'UN TOUR (garde-fou anti-runaway ; réinitialisé à chaque tour). */
const MAX_WALL_CLOCK_MS = 60 * 60_000;
/** Taille max du checkpoint sérialisé. */
const MAX_CHECKPOINT_BYTES = 8_000_000;
/**
 * Chemins édités qu'un tour emporte au chunk suivant (MIN-210) — les PLUS RÉCENTS
 * au-delà. Le cap tient `MAX_CHECKPOINT_BYTES` à l'abri d'une refonte à mille
 * fichiers, et il coûte peu : `formatTypeErrors` ne fait que remonter les chemins
 * touchés en tête du bloc, il ne filtre rien — un chemin tombé sous le cap voit
 * quand même ses erreurs servies, plus bas.
 */
const CHECKPOINT_EDITED_PATHS_MAX = 200;
/**
 * Images montrées au modèle par TOUR (MIN-111) — même esprit que
 * `MAX_WEB_SEARCHES_PER_TURN` : une maquette ou deux états d'un même écran, c'est
 * ce dont un tour a besoin. Au-delà, `read_resource` répond sans image.
 */
const MAX_IMAGES_PER_TURN = 2;
/** Borne du re-queue « message en attente » sur erreur mid-turn (catch final) :
    `attempts` (incrémenté à chaque claim) n'est pas remis à zéro sur ce chemin,
    donc une erreur persistante s'arrête après ce nombre de claims. */
const MAX_ERROR_REQUEUE_ATTEMPTS = 2;
/**
 * Wall-clock max d'UN sous-agent (MIN-112). Sa soft-deadline effective est
 * `min(ça, budget restant du chunk − SUBAGENT_PARENT_RESERVE_MS)`.
 *
 * Pas « la moitié du restant » : le parent n'a pas besoin de la moitié du chunk
 * pour lire un rapport et conclure — il lui faut une RÉSERVE, pas une part. La
 * moitié plafonnait une fille à ~2 min sur un chunk de 250 s, ce qui coupait net
 * toute tâche déléguée un peu sérieuse.
 */
const SUBAGENT_MAX_MS = 600_000;
/** Marge gardée pour couper les filles et livrer leur rapport partiel DANS le tour
 *  (avant le type-check, qui doit voir leurs fichiers). */
const SUBAGENT_CUT_MARGIN_MS = 10_000;
/**
 * Délai posé sur un chunk REFUSÉ à l'admission (MIN-212) : le temps que le drain
 * affamé qui vient de le claim finisse sa fenêtre sans le reprendre. Le prochain
 * drain — 270 s depuis un lancement, 760 s au cron — le reprendra à budget plein.
 */
const SUBAGENT_RESUME_DEFER_MS = 30_000;
// `SUBAGENT_MAX_ROUNDS`/`subagentRoundsLeft` et les deux bornes de TEMPS d'une
// fille (`SUBAGENT_PARENT_RESERVE_MS`, `SUBAGENT_MIN_MS`, d'où
// `chunkFitsSubagentResume`) vivent dans `subagent-config.ts` : un plafond atteint
// doit COUPER la fille ou REFUSER le chunk, jamais lui rendre un round ni une
// seconde — et cette arithmétique-là mérite un test à elle (cf. l'historique du
// zombie à un round par chunk, sur l'axe rounds puis sur l'axe temps).
/**
 * Base des seq de fichiers de sortie d'un sous-agent, hors de la bande du parent
 * (`run.continuations * 1000`, soit au plus ~20 000 avec AGENT_MAX_CONTINUATIONS).
 * Sans ça, deux exec-tools d'un même chunk écriraient le même `slug-<seq>.log`
 * (cf. `toolOutputFileName`) et le second écraserait la sortie du premier.
 */
const SUBAGENT_OUTPUT_SEQ_BASE = 500_000;

export type ExecuteOutcome = "completed" | "suspended" | "interrupted" | "failed";

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function slugForBranch(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Cap du diff renvoyé au modèle après une édition (le diff complet n'est pas utile). */
const EDIT_DIFF_CAP = 4000;

/**
 * Dernier texte écrit par l'assistant dans un historique. Sert au rapport PARTIEL
 * d'un sous-agent coupé (MIN-112) : sa boucle n'a pas de `reply`, mais ce qu'elle a
 * écrit en dernier est souvent l'essentiel de ce qu'elle avait à dire. Le jeter
 * reviendrait à perdre le travail et l'argent déjà dépensés.
 */
/**
 * Budget d'historique qu'UNE fille suspendue a le droit d'emporter dans le
 * checkpoint (MIN-112). Le checkpoint entier est plafonné à `MAX_CHECKPOINT_BYTES`
 * (8 Mo) et le dépassement fait ÉCHOUER le tour : une fille bavarde ne doit pas
 * pouvoir tuer la session de son parent pour s'offrir une reprise.
 */
const SUBAGENT_HISTORY_MAX_BYTES = 1_500_000;

/**
 * Prépare l'historique d'une fille pour le checkpoint, ou `null` s'il ne rentre
 * pas. On élague d'abord les sorties de tools périmées — le même traitement que la
 * boucle applique à son propre historique, et de loin le plus gros poste. Ce qui
 * reste au-dessus du budget n'est pas tronqué au hasard : un historique coupé au
 * milieu casse l'appariement tool_call ↔ tool_result et le round-trip échouerait
 * au provider. Mieux vaut renoncer à la reprise et livrer un rapport partiel.
 */
function capSubagentHistory(messages: AgentChatMessage[]): AgentChatMessage[] | null {
  if (!messages.length) return null;
  const trimmed = [...messages];
  pruneToolOutputs(trimmed);
  return JSON.stringify(trimmed).length <= SUBAGENT_HISTORY_MAX_BYTES ? trimmed : null;
}

function lastAssistantText(messages: AgentChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (text) return text;
  }
  return "";
}

function toNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Exécuteur du tool `create_pr` (fourni par executeAgentRun, qui a le contexte git/PR). */
type CreatePrHandler = (args: {
  title: string;
  body?: string;
}) => Promise<{ result: unknown; success: boolean }>;

/** Exécuteur du tool `web_search` (null quand le run n'a pas accès au web). */
type WebSearchHandler =
  | ((query: string) => Promise<{ result: unknown; success: boolean }>)
  | null;

/**
 * Refus d'un tool absent du jeu de l'appelant (MIN-112). Un sous-agent ne devrait
 * jamais y arriver (le tool n'est pas dans son schéma) mais un modèle en invente
 * parfois un qu'il a vu ailleurs, et un vieux checkpoint peut porter un système qui
 * le décrit : mieux vaut un refus qui DIT pourquoi qu'un « Unknown tool » qui laisse
 * le modèle retenter au round suivant.
 */
function subagentDenied(name: string, why: string): { result: unknown; success: boolean } {
  return {
    result: {
      error: `You do not have the ${name} tool: ${why}. Do the part you can, then report it.`,
    },
    success: false,
  };
}

/**
 * Les mains de `run_background` (MIN-114) dans LA microVM de ce chunk : la
 * politique (plafond, garde-fou git, offsets, mise en forme) vit dans le module
 * pur `background.ts`, ce runner ne fait que la poser sur la sandbox. `workdir`
 * passe par `resolveWithin` — un `../..` revient au modèle en erreur de tool.
 */
function sandboxBackgroundRunner(sandbox: Sandbox): BackgroundJobRunner {
  return {
    start: ({ jobId, command, workdir }) =>
      startBackground(sandbox, {
        jobId,
        command,
        cwd: workdir ? resolveWithin(REPO_DIR, workdir) : undefined,
      }),
    read: ({ jobId, pid, offset }) =>
      readBackgroundSince(sandbox, { jobId, pid, offset, maxBytes: BACKGROUND_FETCH_BYTES }),
    stop: ({ pid }) => stopBackground(sandbox, pid),
  };
}

/**
 * Ce dont un exec-tool a besoin. Un objet plutôt qu'une liste de positions : depuis
 * les sous-agents (MIN-112) il y a DEUX exec-tools par chunk, celui du parent et
 * celui d'une fille, et ils ne diffèrent que par une poignée de champs — nullables
 * ici, structurellement absents là-bas.
 */
interface ExecToolConfig {
  sandbox: Sandbox;
  /** null = pas de livraison (jeu d'un sous-agent : la PR appartient au parent). */
  createPr: CreatePrHandler | null;
  /** Écritures sur la pull request RELUE (MIN-168). null hors session de
   *  relecture : ces trois tools ne sont alors ni offerts ni exécutables. */
  prCtx: PrToolContext | null;
  /** null = pas de tools ticket (idem : le ticket appartient au parent). */
  issueCtx: IssueToolContext | null;
  /** null = pas de tools carnet. */
  scratchpadCtx: ScratchpadToolContext | null;
  webSearch: WebSearchHandler;
  /** Base des seq de fichiers de sortie déposés (tranchée par continuation, comme
      les autres compteurs de run) : deux chunks n'écrasent pas leurs fichiers — et
      deux exec-tools d'un même chunk non plus (cf. `toolOutputFileName`). */
  outputSeqBase: number;
  /** Registre des jobs de fond du chunk (MIN-114). Tenu par l'appelant : c'est lui
      qui les tue avant chaque push et en fin de chunk. null = pas de jobs de fond. */
  background: BackgroundJobs | null;
  /** Instructions repo déjà servies (MIN-115) — muté ici, persisté par l'appelant.
      PROPRE à chaque exec-tool : partager celui du parent marquerait un `AGENTS.md`
      « déjà servi » alors qu'il ne l'a été qu'à une fille, dont le contexte meurt
      avec elle — le parent ne le lirait jamais. */
  instructions: InstructionsState;
  /** Fichiers du dépôt édités depuis le dernier type-check (MIN-110). Muté ici,
      lu et vidé par le hook de fin de tour de l'appelant. PARTAGÉ avec les
      sous-agents : c'est ce que le type-check de fin de tour lit, et une fille qui
      casse un type doit le faire dire. */
  editedPaths: Set<string>;
  /** Registre des sous-agents du chunk (MIN-112). null = jeu d'un sous-agent (la
      hiérarchie est à un niveau) ou vieux checkpoint qui appelle encore ces tools. */
  subagents: Subagents | null;
  /** Ce qu'il reste du budget TEMPS du chunk (MIN-214) — la même horloge que celle
      qui borne un sous-agent. Elle borne aussi le timeout d'un `run_command` : sans
      elle, une commande entamée juste avant la soft-deadline allait au bout de ses
      180 s et la fonction mourait avant d'écrire le checkpoint. PARTAGÉE avec les
      filles : c'est l'horloge du CHUNK, celle que la plateforme tue. */
  chunkRemainingMs: () => number;
}

/** Les tools « métier » de l'agent : Sandbox (fichiers/commandes/jobs de fond),
    git/PR (`createPr`), tickets minddy (`issue-tools.ts`), carnet du lanceur
    (`scratchpad-tools.ts`) et délégation (`subagent.ts`) — routés par nom. Les
    tools minddy sont servis aux DEUX ancrages (MIN-125) : l'ancrage ne pilote plus
    que la cible par défaut des tools ticket, portée par leur contexte. */
function makeExecTool(cfg: ExecToolConfig): ExecuteAgentTool {
  const {
    sandbox,
    createPr,
    prCtx,
    issueCtx,
    scratchpadCtx,
    webSearch,
    outputSeqBase,
    background,
    instructions,
    editedPaths,
    subagents,
    chunkRemainingMs,
  } = cfg;
  let outputSeq = 0;
  /** Images déjà montrées au modèle sur ce chunk (plafond MAX_IMAGES_PER_TURN). */
  let imagesUsed = 0;

  /**
   * Plafonne les images renvoyées par un tool (MIN-111), sur le modèle du plafond
   * de `web_search` : au-delà, le résultat repart SANS image, avec une note qui dit
   * pourquoi — un modèle qui rouvre la même maquette à chaque round remplirait le
   * checkpoint sans rien apprendre de plus.
   */
  const capTurnImages = (out: {
    result: unknown;
    success: boolean;
    reason?: string;
    images?: AgentToolImage[];
  }) => {
    const images = out.images ?? [];
    if (images.length === 0) return out;
    const room = MAX_IMAGES_PER_TURN - imagesUsed;
    if (room <= 0) {
      const note = `Image limit reached for this turn (${MAX_IMAGES_PER_TURN} images). Work from the ones you already looked at — the metadata and download_url above still describe this file.`;
      const result =
        out.result && typeof out.result === "object"
          ? { ...(out.result as object), image_omitted: note }
          : { image_omitted: note };
      return { ...out, images: undefined, result };
    }
    imagesUsed += Math.min(room, images.length);
    return { ...out, images: images.slice(0, room) };
  };

  /**
   * Colle au résultat d'un tool d'édition réussi les instructions des SOUS-DOSSIERS
   * qu'il vient de toucher (MIN-115). Codex concatène tout l'arbre à l'amorce ; nous
   * chargeons PARESSEUSEMENT, à la première édition sous un dossier — un monorepo
   * remplirait sinon le budget de conventions de paquets jamais ouverts, au détriment
   * de celles de la racine. Le bloc part dans le RÉSULTAT du tool : l'historique
   * d'amorce, lui, est figé par le checkpoint. La règle (une lecture par chemin et
   * par run, budget global) vit dans `repo-instructions.ts` ; ici il n'y a que la
   * sandbox. Best-effort — un `AGENTS.md` illisible ne casse pas l'édition.
   *
   * Le bloc passe EN TÊTE de l'objet : le résultat entier traverse `headTail`, qui
   * élide le MILIEU — la tête survit, et un gros diff en queue aussi.
   */
  const withTouchedInstructions = async (
    res: { result: unknown; success: boolean },
    paths: string[],
  ): Promise<{ result: unknown; success: boolean }> => {
    if (!res.success) return res;
    // Entonnoir unique de TOUTE édition réussie (edit_file, write_file, move_file,
    // apply_edits, apply_patch) : c'est ici qu'on note ce que le tour a touché,
    // pour le type-check de fin de tour (MIN-110).
    for (const path of paths) if (path) editedPaths.add(path);
    const block = await collectTouchedInstructions(
      paths.filter(Boolean),
      instructions,
      (path) => readWorkFile(sandbox, path).catch(() => null),
    ).catch((err) => {
      console.error("[agent-execute] subdir instructions failed:", (err as Error).message);
      return null;
    });
    if (!block) return res;
    if (typeof res.result === "string") {
      return { ...res, result: `${block}\n\n${res.result}` };
    }
    return { ...res, result: { repo_instructions: block, ...(res.result as object) } };
  };

  return async (name, args, callId) => {
    // Verrou d'écriture de la sandbox PARTAGÉE (MIN-112). Le parent qui continue
    // d'éditer pendant qu'une fille écrit est exactement le même risque que deux
    // filles simultanées, dans un dépôt dont la fin de tour fait `git add -A`. La
    // décision vit dans `subagent.ts` (module de politique, testable) ; ici il n'y a
    // que le branchement. La lecture et `run_command` restent ouverts.
    const locked = subagents?.writeLock(name);
    if (locked) return locked;
    if (ISSUE_TOOL_NAMES.has(name)) {
      if (!issueCtx) return subagentDenied(name, "minddy tickets belong to the parent session");
      return capTurnImages(await executeIssueTool(issueCtx, name, args));
    }
    if (SCRATCHPAD_TOOL_NAMES.has(name)) {
      if (!scratchpadCtx) {
        return subagentDenied(name, "the user's notebook belongs to the parent session");
      }
      return await executeScratchpadTool(scratchpadCtx, name, args);
    }
    if (PR_TOOL_NAMES.has(name)) {
      if (!prCtx) {
        return {
          result: {
            error: `${name} is only available in a pull request review session.`,
          },
          success: false,
        };
      }
      return await executePrTool(prCtx, name, args);
    }
    if (SUBAGENT_CONTROL_TOOLS.has(name)) {
      if (!subagents) {
        return subagentDenied(
          name,
          "the sub-agent hierarchy is one level deep, so a sub-agent cannot delegate further",
        );
      }
      if (name === "agent_status") return subagents.status(args);
      if (name === "list_agents") return subagents.list();
      return await subagents.spawn(args, { parentCallId: callId });
    }
    switch (name) {
      case "web_search": {
        const query = String(args.query ?? "").trim();
        if (!query) return { result: { error: "query is required" }, success: false };
        if (!webSearch) {
          return { result: { error: "Web search is not available on this run." }, success: false };
        }
        return await webSearch(query);
      }
      case "create_pr": {
        if (!createPr) {
          return subagentDenied(
            "create_pr",
            "the pull request belongs to the parent session, which decides when to open it",
          );
        }
        return await createPr({
          title: String(args.title ?? "").trim(),
          body: typeof args.body === "string" ? args.body : undefined,
        });
      }
      case "read_file": {
        const win = await readWorkFileWindow(sandbox, String(args.path ?? ""), {
          offset: toNum(args.offset),
          limit: toNum(args.limit),
        });
        if (!win) return { result: "(file not found)", success: false };
        const footer = win.truncated
          ? `\n\n[Showing lines ${win.startLine}-${win.startLine + win.returnedLines - 1} of ${win.totalLines}. Use offset/limit to read more.]`
          : "";
        return { result: (win.content || "(empty file)") + footer, success: true };
      }
      case "list_dir": {
        const content = await listDir(sandbox, args.path ? String(args.path) : ".");
        return { result: content || "(empty)", success: true };
      }
      case "glob": {
        const { files, truncated } = await globRepo(
          sandbox,
          String(args.pattern ?? ""),
          args.path ? String(args.path) : undefined,
        );
        if (files.length === 0) return { result: "(no files matched)", success: true };
        const note = truncated ? `\n… (capped at ${files.length} files)` : "";
        return { result: files.join("\n") + note, success: true };
      }
      case "grep": {
        const r = await grepRepo(sandbox, {
          pattern: String(args.pattern ?? ""),
          path: args.path ? String(args.path) : undefined,
          glob: args.glob ? String(args.glob) : undefined,
          outputMode: (args.output_mode as GrepOutputMode) ?? undefined,
          ignoreCase: args.ignore_case === true,
          fixedStrings: args.fixed_strings === true,
          context: toNum(args.context),
          headLimit: toNum(args.head_limit),
        });
        if (!r.ok) {
          return { result: { error: `grep failed: ${r.error || "invalid pattern or options"}` }, success: false };
        }
        // Motif relancé en littéral : on le DIT, sinon le modèle ne saurait pas
        // que ce qu'il croyait être une regex a été cherché tel quel (MIN-109).
        const note = r.retriedAsLiteral ? `${LITERAL_RETRY_NOTE}\n` : "";
        return { result: note + (r.output || "(no matches)"), success: true };
      }
      case "edit_file": {
        const path = String(args.path ?? "");
        const original = await readWorkFile(sandbox, path);
        if (original === null) {
          return {
            result: { error: `File not found: ${path}. Use write_file to create a new file.` },
            success: false,
          };
        }
        try {
          const edit = applyEdit(
            path,
            original,
            String(args.old_string ?? ""),
            String(args.new_string ?? ""),
            args.replace_all === true,
          );
          await writeWorkFile(sandbox, path, edit.content);
          return await withTouchedInstructions(
            {
              result: {
                path,
                additions: edit.additions,
                deletions: edit.deletions,
                diff: cap(edit.diff, EDIT_DIFF_CAP),
              },
              success: true,
            },
            [path],
          );
        } catch (err) {
          return { result: { error: err instanceof Error ? err.message : String(err) }, success: false };
        }
      }
      case "write_file": {
        const path = String(args.path ?? "");
        await writeWorkFile(sandbox, path, String(args.content ?? ""));
        return await withTouchedInstructions({ result: `Wrote ${path}`, success: true }, [path]);
      }
      case "move_file": {
        const to = String(args.to ?? "");
        await moveWorkFile(sandbox, String(args.from ?? ""), to);
        return await withTouchedInstructions(
          { result: `Moved ${args.from} → ${to}`, success: true },
          [to],
        );
      }
      case "delete_file": {
        const path = String(args.path ?? "");
        await deleteWorkFile(sandbox, path);
        // Supprimer un fichier casse des types tout aussi bien qu'en éditer un ;
        // il ne passe pas par `withTouchedInstructions` (rien à charger pour un
        // fichier qui n'est plus là), d'où la note ici.
        if (path) editedPaths.add(path);
        return { result: `Deleted ${args.path}`, success: true };
      }
      case "apply_edits": {
        const changes = Array.isArray(args.changes) ? (args.changes as Array<Record<string, unknown>>) : [];
        if (changes.length === 0) {
          return { result: { error: "No changes provided." }, success: false };
        }
        const applied: Array<Record<string, unknown>> = [];
        for (const ch of changes) {
          const path = String(ch.path ?? "");
          const op = String(ch.op ?? "update");
          try {
            if (op === "delete") {
              await deleteWorkFile(sandbox, path);
              applied.push({ path, op, ok: true });
            } else if (op === "move") {
              const to = String(ch.move_to ?? "");
              await moveWorkFile(sandbox, path, to);
              applied.push({ path, op, ok: true, move_to: to });
            } else if (op === "add") {
              await writeWorkFile(sandbox, path, String(ch.content ?? ""));
              applied.push({ path, op, ok: true });
            } else {
              // update : applique tous les edits en mémoire, puis écrit une fois (atomique/fichier).
              const original = await readWorkFile(sandbox, path);
              if (original === null) throw new Error(`File not found: ${path}`);
              const edits = Array.isArray(ch.edits) ? (ch.edits as Array<Record<string, unknown>>) : [];
              let content = original;
              let additions = 0;
              let deletions = 0;
              for (const e of edits) {
                const r = applyEdit(
                  path,
                  content,
                  String(e.old_string ?? ""),
                  String(e.new_string ?? ""),
                  e.replace_all === true,
                );
                content = r.content;
                additions += r.additions;
                deletions += r.deletions;
              }
              await writeWorkFile(sandbox, path, content);
              applied.push({ path, op: "update", ok: true, additions, deletions });
            }
          } catch (err) {
            applied.push({ path, op, ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        }
        // `success` = « au moins un changement est passé » (MIN-109). Avec `every`,
        // un batch de 6 fichiers dont 5 réussissent était compté ÉCHEC — un taux
        // d'échec de 42 % qui ne mesurait rien. Le détail par changement dit déjà
        // quoi reprendre ; `counts` le rend lisible d'un coup d'œil.
        const okCount = applied.filter((r) => r.ok === true).length;
        return await withTouchedInstructions(
          {
            result: { applied, counts: { ok: okCount, failed: applied.length - okCount } },
            success: okCount > 0,
          },
          applied.filter((r) => r.ok === true).map((r) => String(r.move_to ?? r.path ?? "")),
        );
      }
      case "apply_patch": {
        // Le format `apply_patch` de Codex/OpenCode (MIN-115), servi aux modèles
        // `gpt-*` à la PLACE d'edit_file/apply_edits/write_file. `patch.ts` parse
        // et traduit en substitutions ; l'application reste la cascade d'edit.ts.
        // Un patch illisible revient en erreur de tool : le modèle lit pourquoi et
        // corrige au round suivant, sans qu'aucun fichier n'ait été touché.
        let ops: PatchOp[];
        try {
          ops = parsePatch(String(args.patch ?? args.patchText ?? ""));
        } catch (err) {
          return {
            result: { error: err instanceof Error ? err.message : String(err) },
            success: false,
          };
        }
        const applied: Array<Record<string, unknown>> = [];
        for (const op of ops) {
          try {
            if (op.op === "delete") {
              await deleteWorkFile(sandbox, op.path);
              applied.push({ path: op.path, op: "delete", ok: true });
            } else if (op.op === "add") {
              const existing = await readWorkFile(sandbox, op.path);
              if (existing !== null) {
                throw new Error(
                  `File already exists: ${op.path}. Use '*** Update File: ${op.path}' to change it.`,
                );
              }
              await writeWorkFile(sandbox, op.path, op.content);
              applied.push({ path: op.path, op: "add", ok: true });
            } else {
              const original = await readWorkFile(sandbox, op.path);
              if (original === null) {
                throw new Error(
                  `File not found: ${op.path}. Use '*** Add File: ${op.path}' to create it.`,
                );
              }
              const edited = applyPatchEdits(op.path, original, op.edits);
              if (op.moveTo) {
                // Renommage d'abord (git mv, pour que la PR le capture), contenu ensuite.
                await moveWorkFile(sandbox, op.path, op.moveTo);
                await writeWorkFile(sandbox, op.moveTo, edited.content);
                applied.push({
                  path: op.path,
                  op: "move",
                  ok: true,
                  move_to: op.moveTo,
                  additions: edited.additions,
                  deletions: edited.deletions,
                });
              } else {
                await writeWorkFile(sandbox, op.path, edited.content);
                applied.push({
                  path: op.path,
                  op: "update",
                  ok: true,
                  additions: edited.additions,
                  deletions: edited.deletions,
                });
              }
            }
          } catch (err) {
            applied.push({
              path: op.path,
              op: op.op,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        // Même règle que `apply_edits` (MIN-109) : `success` = « au moins une
        // section est passée ». Le détail par fichier dit quoi reprendre.
        const okCount = applied.filter((r) => r.ok === true).length;
        return await withTouchedInstructions(
          {
            result: { applied, counts: { ok: okCount, failed: applied.length - okCount } },
            success: okCount > 0,
          },
          applied.filter((r) => r.ok === true).map((r) => String(r.move_to ?? r.path ?? "")),
        );
      }
      case "run_command": {
        const command = String(args.command ?? "");
        // Commande vide (MIN-204) : `sh -c ""` rend exit 0 et une sortie vide,
        // que le modèle lit comme « la suite de tests est passée ». Le refus est
        // ici en second rideau — la boucle rejette déjà les arguments illisibles —
        // et attrape aussi l'argument bien formé mais mal nommé.
        if (!command.trim()) return { result: { error: "command is required" }, success: false };
        // Garde-fou git (MIN-108) : la règle « le harness possède git » est
        // EXÉCUTÉE ici, plus seulement dite dans le prompt. Refus = erreur de
        // tool, sans toucher au Sandbox — le round continue et le modèle lit
        // pourquoi. `reason` rend le refus mesurable sur agent_run_events.
        const verdict = checkCommand(command);
        if (!verdict.allowed) {
          return {
            result: { error: verdict.reason },
            success: false,
            reason: FORBIDDEN_COMMAND_REASON,
          };
        }
        // `workdir` (MIN-109) : le modèle préfixait un `cd` dans 13 % des commandes,
        // souvent vers le répertoire courant par défaut. Le chemin passe par
        // resolveWithin — un `../..` sort du dépôt et revient en erreur de tool,
        // pas en throw : le round continue et le modèle corrige.
        let cwd: string | undefined;
        if (args.workdir != null && String(args.workdir).trim() !== "") {
          try {
            cwd = resolveWithin(REPO_DIR, String(args.workdir));
          } catch (err) {
            return {
              result: { error: err instanceof Error ? err.message : String(err) },
              success: false,
            };
          }
        }
        // Le modèle peut RACCOURCIR le timeout, jamais l'allonger — et le RESTANT du
        // chunk le raccourcit à son tour (MIN-214). Le plafond seul ne bornait que
        // la commande, pas le round : une commande lancée juste avant la
        // soft-deadline allait au bout de ses 180 s, la fonction était tuée avant
        // d'écrire le checkpoint, et tout le chunk partait avec.
        const timeoutMs = runCommandTimeoutMs(
          toNum(args.timeout_ms),
          chunkRemainingMs(),
          RUN_COMMAND_TIMEOUT_MS,
        );
        const r = await runShell(sandbox, command, { cwd, timeoutMs });
        // Sortie longue → la version COMPLÈTE est déposée dans la sandbox (hors
        // dépôt) et reste relisible via read_file/grep. Best-effort : si l'écriture
        // échoue, le modèle reçoit quand même tête ET queue (MIN-107).
        let fullOutputPath: string | null = null;
        if (spillsToDisk(r)) {
          fullOutputPath = await writeToolOutput(
            sandbox,
            toolOutputFileName(command, outputSeqBase + outputSeq++),
            fullOutputDocument(command, r),
          ).catch((err) => {
            console.error("[agent-execute] tool output spill failed:", (err as Error).message);
            return null;
          });
        }
        return {
          result: formatRunCommandResult(r, fullOutputPath),
          success: r.exitCode === 0,
        };
      }
      case "run_background": {
        // Le garde-fou git, le plafond de jobs et les offsets sont dans
        // `background.ts` — y compris le refus des commandes interdites (MIN-108),
        // sans quoi ce tool serait une porte dérobée sur `git push`.
        if (!background) {
          return subagentDenied(
            "run_background",
            "background jobs are held by the parent session, which kills them at the end of the turn — a job you left running would keep the machine awake with nobody watching it",
          );
        }
        return await background.handle(args);
      }
      default:
        return { result: `Unknown tool: ${name}`, success: false };
    }
  };
}

/** Lit un fichier d'instructions du dépôt, ou null (absent / illisible). */
async function readInstructionFile(
  sandbox: Sandbox,
  path: string,
): Promise<RepoInstructionFile | null> {
  try {
    const content = await readWorkFile(sandbox, path);
    return content?.trim() ? { path, content } : null;
  } catch {
    return null;
  }
}

/**
 * Lit les instructions du dépôt (AGENTS.md / CLAUDE.md à la racine) et les emballe
 * en un message délimité, ou null s'il n'y en a pas. Lu UNE fois à l'amorce (le
 * checkpoint le transporte ensuite). C'est là qu'un repo déclare ses commandes de
 * build/test, ses conventions et ses interdits — le carburant d'un diff correct.
 * Celles des SOUS-DOSSIERS arrivent plus tard, à la première édition dedans
 * (MIN-115) — cf. `makeExecTool`.
 */
async function readRepoInstructions(
  sandbox: Sandbox,
): Promise<{ message: string; bytes: number } | null> {
  const files: RepoInstructionFile[] = [];
  for (const name of REPO_INSTRUCTION_FILES) {
    const file = await readInstructionFile(sandbox, name);
    if (file) files.push(file);
  }
  return formatBootInstructions(files);
}

interface IssueContext {
  identifier: string;
  title: string;
  description: string | null;
  plan: string | null;
  projectName: string | null;
  projectKey: string;
  /** Ressources du ticket (et de ses commentaires) — annoncées dans l'amorce
      pour que l'agent sache qu'elles existent : un fichier s'y ouvre via
      `read_resource`, un lien s'y lit directement. */
  resources: AgentResourceContext[];
}

async function loadIssueContext(run: AgentRun, issueId: string): Promise<IssueContext> {
  const service = getServiceClient();
  const [{ data: issue }, { data: project }, { data: attachmentRows }] = await Promise.all([
    service
      .from("issues")
      .select("number, title, description, plan")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
    service
      .from("attachments")
      .select("id, kind, url, file_name, mime_type, size_bytes")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true }),
  ]);
  const key = (project as { key?: string } | null)?.key ?? "ISSUE";
  const number = (issue as { number?: number } | null)?.number ?? 0;
  return {
    identifier: `${key}-${number}`,
    title: (issue as { title?: string } | null)?.title ?? "Untitled",
    description: (issue as { description?: string | null } | null)?.description ?? null,
    plan: (issue as { plan?: string | null } | null)?.plan ?? null,
    projectName: (project as { name?: string } | null)?.name ?? null,
    projectKey: key,
    resources: ((attachmentRows ?? []) as Array<{
      id: string;
      kind: string | null;
      url: string | null;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
    }>).map((a) =>
      a.kind === "link"
        ? {
            id: a.id,
            kind: "link" as const,
            name: a.file_name ?? "link",
            url: a.url,
          }
        : {
            id: a.id,
            kind: "file" as const,
            name: a.file_name ?? "attachment",
            mimeType: a.mime_type ?? "application/octet-stream",
            sizeBytes: a.size_bytes ?? 0,
          }
    ),
  };
}

/** Contexte projet d'un run CARNET (MIN-84) : pas de ticket, juste le projet. */
async function loadProjectContext(
  projectId: string,
): Promise<{ key: string; name: string | null }> {
  const service = getServiceClient();
  const { data } = await service
    .from("projects")
    .select("key, name")
    .eq("id", projectId)
    .maybeSingle();
  return {
    key: (data as { key?: string } | null)?.key ?? "PROJECT",
    name: (data as { name?: string } | null)?.name ?? null,
  };
}

/**
 * Assemble le message d'amorce d'une run FROIDE qui hérite du travail du ticket
 * (MIN-68, indexé sur la branche), ou null si la run n'hérite de rien (premier
 * lancement). Deux formes :
 *  • la lignée porte une PR → PR + fil de review lus À CHAUD sur GitHub (pas figés
 *    au lancement : entre la création de la run et son exécution, un reviewer a pu
 *    commenter, et c'est souvent CE commentaire qui motive la relance) ;
 *  • la lignée n'a pas (encore) de PR → message de branche héritée (le travail
 *    poussé continue ; `create_pr` reste une décision).
 * Le résumé de la run précédente vient de la base (`outcome`).
 *
 * Best-effort : GitHub indisponible ne doit pas faire échouer la run — on retombe
 * sur le contexte minimal (« tu itères sur cette branche, va la lire »).
 */
async function buildInheritedPrContext(
  run: AgentRun,
  opts: {
    forge: Forge;
    token: string;
    repoFullName: string;
    repo: AgentRepoContext;
  },
): Promise<string | null> {
  // Un run CARNET n'hérite jamais (pas de lignée) : rien à raconter.
  if (!run.issue_id) return null;
  const issueId = run.issue_id;
  if (run.pr_number == null) {
    // Pas de PR : la branche héritée porte-t-elle du travail d'une session
    // précédente ? (Une branche neuve stampée par un premier chunk crashé, non.)
    if (!run.branch_name) return null;
    const inherited = await branchHasPriorRun(
      issueId,
      run.branch_name,
      run.created_at,
    ).catch(() => false);
    if (!inherited) return null;
    const previousSummary = await previousRunSummaryForIssue(issueId, run.id).catch(
      () => null,
    );
    return buildInheritedBranchMessage({ repo: opts.repo, previousSummary });
  }
  const number = run.pr_number;

  const [pr, comments, reviewComments, reviewThreads, previousSummary] = await Promise.all([
    opts.forge
      .getPullRequest({ token: opts.token, repoFullName: opts.repoFullName, number })
      .catch(() => null),
    opts.forge
      .listPullRequestComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // Commentaires ancrés au code : l'agent doit voir ce qu'on lui demande de
    // corriger LIGNE À LIGNE, pas seulement le fil de conversation.
    opts.forge
      .listPullRequestReviewComments({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    // Fils RÉSOLUS (MIN-139) : sans eux l'agent relirait un point déjà réglé
    // comme une demande vivante. Best-effort — l'état manquant vaut « inconnu »,
    // et les fils repartent alors tous non marqués, comme avant.
    opts.forge
      .listReviewThreads({
        token: opts.token,
        repoFullName: opts.repoFullName,
        number,
      })
      .catch(() => []),
    previousRunSummaryForIssue(issueId, run.id).catch(() => null),
  ]);

  return buildInheritedPrMessage({
    repo: opts.repo,
    pr: {
      number,
      title: pr?.title ?? null,
      body: pr?.body ?? null,
      // Le vocabulaire minddy, pas celui de la forge (MIN-164) : dire `open`
      // d'un brouillon cacherait à l'agent que ce travail n'a jamais été
      // proposé. PR illisible → on se rabat sur l'état figé au lancement.
      state: pr ? prStateFromRef(pr) : run.pr_state,
      comments: comments.map((c) => ({ author: c.user?.login ?? null, body: c.body })),
      lineThreads: toPrLineThreads(reviewComments, reviewThreads),
      previousSummary,
    },
  });
}

/**
 * Message de commit d'une fin de tour : la première ligne de la réponse de l'agent
 * (nettoyée du markdown, bornée), sinon un générique. Les PR sont squash-mergées
 * par défaut — le message n'a pas besoin d'être parfait, juste lisible.
 */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
}

export async function executeAgentRun(
  run: AgentRun,
  opts: { deadlineMs: number },
): Promise<ExecuteOutcome> {
  const callStart = Date.now();
  /**
   * Events du chunk, SÉRIALISÉS derrière une chaîne de promesses (MIN-112).
   *
   * `appendEvent` calcule `seq` en lisant le max puis en insérant, et
   * `idx_agent_run_events_run_seq` est UNIQUE : c'était sûr tant qu'un chunk n'avait
   * qu'un émetteur. Depuis les sous-agents, une fille émet EN MÊME TEMPS que son
   * parent. `appendEvent` retente désormais sur collision — il ne PERD plus rien —
   * mais l'ORDRE du fil resterait au hasard des courses. La chaîne le rétablit : les
   * events partent dans l'ordre où ils ont été produits, donc `?after=<seq>` reste
   * un curseur honnête et le fil relu raconte les faits dans l'ordre.
   *
   * Le maillon avale les erreurs (`appendEvent` est déjà best-effort) : une chaîne
   * cassée arrêterait tous les events suivants du chunk.
   */
  let emitChain: Promise<void> = Promise.resolve();
  const emit: EmitAgentEvent = (type, payload) => {
    emitChain = emitChain
      .then(() => appendEvent(run.id, type, payload))
      .catch(() => {});
    return emitChain;
  };
  // Direct du fil : le texte du round pendant qu'il s'écrit, diffusé sur le topic
  // du run. Rien en base — le fil ouvert l'affiche, les autres n'en savent rien.
  const emitLive: EmitAgentLive = (progress) =>
    broadcastRunStream(run.id, { ...progress, at: Date.now() });
  /**
   * Qui paye ce run (MIN-131) : son CRÉATEUR, pas le owner du projet — un membre
   * qui lance un agent chez quelqu'un d'autre consomme son propre budget, et
   * c'est déjà son quota qui l'a autorisé (`checkAgentQuota(run.created_by)`).
   * Calculé ici, avant le `try`, pour que le métrage sandbox du `finally` en
   * dispose aussi. Un run sans créateur ne peut pas atteindre la sandbox (le
   * tour throw), mais s'il y arrivait, la ligne le dirait plutôt que d'aller
   * chercher un payeur par défaut.
   */
  const runBillTo: AiUsageBillTo = run.created_by
    ? { userId: run.created_by }
    : { unattributed: `run ${run.id} sans created_by` };
  /**
   * SOUS QUELLE LIGNE ce run se facture (MIN-185). Techniquement c'est le même
   * run ; en facturation, non : un run d'agent est un geste qu'on a fait, un
   * passage de routine est un abonnement qu'on a laissé tourner. Résolu ICI,
   * une fois, avant le `try` — le métrage de la microVM vit dans le `finally`,
   * et une des deux moitiés rangée ailleurs que l'autre rendrait la séparation
   * à moitié fausse.
   */
  const usageFeature = run.routine_id ? "routine_code" : "agent_code";
  const sandboxUsageFeature = run.routine_id ? "routine_compute" : "sandbox_compute";
  let sandbox: Sandbox | null = null;
  // Jobs de fond du chunk (MIN-114), visibles du `finally` : quel que soit le
  // chemin de sortie (fin de tour, erreur, interruption), rien ne survit au chunk.
  let backgroundJobs: BackgroundJobs | null = null;
  // Sous-agents du chunk (MIN-112), visibles du `finally` : une fille laissée en vol
  // continuerait d'appeler un modèle et d'écrire dans la sandbox après le retour de
  // la fonction — au nom d'un tour qui n'existe plus.
  let subagentRegistry: Subagents | null = null;

  try {
    /**
     * ADMISSION (MIN-212) — un chunk trop court pour REPRENDRE une fille est refusé
     * ici, avant l'event `running` et avant le réveil de la microVM : un chunk qui
     * n'a rien à jouer ne doit rien coûter, ni en compute ni dans le fil.
     *
     * Ce qu'il évite. Le budget d'une fille reprise vaut `min(SUBAGENT_MAX_MS,
     * restant du chunk − réserve du parent)`, planché à 1 s. Sur un chunk de fin de
     * fenêtre de drain — 40 à 150 s, la NORME quand plusieurs runs se partagent les
     * 270 s — elle repartait avec une seconde, jouait un round, se re-suspendait ;
     * le parent, garé sur elle, rendait `suspended` sans dire un mot ; le chunk se
     * re-queuait. Un round par chunk, chacun payant son réveil de microVM, jusqu'à
     * ce que le garde-fou des 20 continuations tue le tour. C'est le jumeau
     * TEMPOREL du zombie de l'axe rounds (cf. `subagentRoundsLeft`), et il se
     * corrige du même côté : par le haut, en refusant, jamais en rendant « au moins
     * un peu » à une boucle qui ne peut pas tourner.
     */
    if (!run.interrupt_requested && (run.checkpoint?.subagents ?? []).some(isResumableSubagent)) {
      // Projection OPTIMISTE de quelques secondes : l'amorçage n'est pas encore
      // consommé. L'écart ne joue que dans une bande étroite au-dessus du seuil, où
      // la fille reçoit un peu moins que son minimum — dégradé, pas pathologique.
      const projectedMs = chunkSoftDeadlineMs(opts.deadlineMs, 0);
      // Un message utilisateur NON CONSOMMÉ passe devant : il DÉPARKE le parent, qui
      // a donc du travail à jouer même sur un chunk court. Le faire attendre le
      // prochain drain pour épargner un round de fille serait un mauvais échange —
      // même arbitrage que le bloc `interrupt_requested` juste en dessous.
      if (
        !chunkFitsSubagentResume(projectedMs) &&
        !(await hasPendingRunMessages(run.id).catch(() => true))
      ) {
        /**
         * Re-queue TEL QUEL, et `continuations` n'est pas incrémenté : un chunk qui
         * n'a rien joué n'est pas une continuation, et le compter comme telle
         * recréerait exactement le zombie qu'on corrige — vingt refus et le
         * garde-fou anti-runaway tuerait le tour. Le `checkpoint` n'est pas réécrit
         * non plus (rien n'a bougé), et `attempts` repart à zéro : le budget de
         * reprise sur crash sert aux chunks qui MEURENT, pas à ceux qui déclinent.
         */
        const deferStamp = {
          status: "queued",
          not_before: new Date(Date.now() + SUBAGENT_RESUME_DEFER_MS).toISOString(),
          attempts: 0,
        } satisfies Parameters<typeof stampRun>[1];
        await stampRun(run.id, deferStamp);
        // Event `status` neutre : invisible dans le fil (aucun `status: running`,
        // donc rien à afficher), comptable en base — c'est lui qui répondra à
        // « combien de chunks refuse-t-on, et avec quel budget ? ».
        await emit("status", {
          phase: "chunk_deferred",
          reason: "subagent_resume",
          budgetMs: projectedMs,
        });
        return "suspended";
      }
    }

    await emit("status", { status: "running", continuation: run.continuations });

    if (!run.created_by) throw new Error("Run has no owner");
    if (!run.model) throw new Error("Run has no model");

    // Interruption demandée alors que le run était EN FILE (entre deux tours) : on
    // repasse au repos sans même réveiller la sandbox.
    //
    // Sauf s'il reste un message NON CONSOMMÉ : le composer envoie toujours le
    // couple steer PUIS interrupt quand l'agent « travaille » (et `queued` compte
    // comme tel), donc le message peut être arrivé juste avant le drapeau. Reposer
    // ici l'avalerait — personne ne draine un run au repos, et l'utilisateur verrait
    // l'agent mourir sans avoir lu sa consigne. On re-queue pour le traiter.
    if (run.interrupt_requested) {
      await clearInterrupt(run.id);
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        continuations: 0,
        attempts: 0,
        window_started_at: null,
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
      });
      return "interrupted";
    }

    // Cible de clone (token frais pour ce chunk) + client PR/MR du provider.
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) throw new Error("No repository linked to this project");
    const forge = forgeFor(target.provider);

    // Ancrage du run, à TROIS valeurs : ticket minddy, CARNET (MIN-84, la note du
    // lanceur est l'instruction), ou PULL REQUEST (MIN-168 — une session de
    // relecture, en lecture seule sur le dépôt).
    const issue = run.issue_id ? await loadIssueContext(run, run.issue_id) : null;
    const prRun = run.pull_request_id ? await loadPrRunContext(run.pull_request_id) : null;
    // Un run ancré à une PR dont la ligne a disparu ne doit PAS retomber en run
    // carnet : il se croirait autorisé à créer une branche et à pousser dessus.
    if (run.pull_request_id && !prRun) {
      throw new Error("The pull request this review was anchored to no longer exists");
    }
    const anchor: AgentAnchor = issue ? "issue" : prRun ? "pr" : "notebook";
    /**
     * Le harnais écrit-il dans le DÉPÔT pour cette session ? Faux pour une
     * relecture, et c'est la moitié harnais de la garantie « aucune écriture » —
     * l'autre moitié étant le jeu de tools, qui n'a aucune édition. Une phrase de
     * prompt ne tiendrait ni l'une ni l'autre.
     */
    const writesToRepo = anchor !== "pr";
    const project = issue
      ? { key: issue.projectKey, name: issue.projectName }
      : await loadProjectContext(run.project_id);
    // Référence lisible du run dans les messages de commit (`wip(...)`).
    const commitRef = issue?.identifier ?? "note";
    // Langue du commentaire + du résumé de l'agent = celle du lanceur (défaut owner),
    // et statut d'atterrissage des tickets créés par l'agent = son réglage de compte.
    const { locale: commentLocale, numoDefaultStatus } = await resolveRunPrefs(run);
    // Session de relecture : les branches sont celles de la PR — sa base est le
    // point de comparaison du diff, sa tête ce qu'on relit. Ailleurs, la base
    // choisie au lancement et la branche de travail du run.
    const baseBranch = (prRun?.baseBranch || run.base_branch) ?? target.defaultBranch;
    const workBranch = prRun
      ? pullRequestLocalBranch(prRun)
      : run.branch_name ??
        (issue
          ? `minddy/agent/${slugForBranch(issue.identifier)}-${run.id.slice(0, 8)}`
          : `minddy/agent/note-${run.id.slice(0, 8)}`);

    // Sandbox : réveille la microVM (filesystem restauré depuis le snapshot
    // persistant → reprise rapide) ; sinon `onCreate` clone la branche de travail.
    // Nom déterministe → même microVM/snapshot d'un tour à l'autre.
    const { sandbox: sb } = await getOrCreateAgentSandbox({
      name: `agent-${run.id}`,
      onCreate: async (fresh) => {
        if (prRun) {
          // Par la REF SERVEUR de la PR, pas par le nom de branche : sur un fork,
          // la branche de tête n'existe pas dans le dépôt de base (cf.
          // `clonePullRequest`). Aucune identité de committer à résoudre — rien
          // ne sera commité.
          await clonePullRequest(fresh, {
            authUrl: target.authUrl,
            baseBranch,
            headRef: pullRequestHeadRef(prRun.provider, prRun.number),
            headBranch: prRun.headBranch,
            localBranch: workBranch,
          });
          return;
        }
        const committer = await resolveCommitterIdentity(target);
        await cloneRepo(fresh, { authUrl: target.authUrl, baseBranch, workBranch, committer });
      },
    });
    sandbox = sb;

    // Persiste l'identité du Sandbox + la base AVANT la boucle (reprise si crash).
    // sandbox_stopped_at:null → la microVM est de nouveau vivante (le reaper l'ignore).
    //
    // `branch_name`, lui, attend le PREMIER PUSH RÉEL (MIN-123, `noteBranchPushed`
    // plus bas) : tant que rien n'est poussé, la branche n'existe que dans la
    // microVM, et les surfaces qui lisent une branche (vue diff, héritage de
    // lignée, ménage des branches) ne doivent pas en désigner une qui n'est pas
    // sur le dépôt. Le nom, lui, est déterministe — un chunk suivant le retrouve
    // sans avoir besoin de le relire en base.
    await stampRun(run.id, {
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      base_branch: baseBranch,
    });

    /**
     * AMORÇAGE TROP LONG (MIN-213) — le budget qu'il reste VRAIMENT, une fois la
     * microVM debout, relu contre le plancher que le chunk s'accorde.
     *
     * `MIN_CHUNK_BUDGET_MS` réserve une indemnité d'amorçage à l'admission, mais un
     * réveil n'est borné par rien (le clone a 180 s de timeout à lui seul) : c'est une
     * moyenne, pas une garantie. Sans cette relecture, un amorçage qui déborde laisse
     * la boucle prendre quand même son plancher, puis pousser — et la fonction est
     * tuée en plein travail. Le run reste alors `running` vingt minutes
     * (`STUCK_RUNNING_MS`) sans un event, et si la VM avait déjà édité six fichiers,
     * le chunk suivant repart d'un historique qui les ignore.
     *
     * Le re-queue est IMMÉDIAT (`not_before` = maintenant) et il est sûr : la microVM
     * est chaude et déjà persistée juste au-dessus, donc le chunk suivant repart
     * dessus sans re-payer le clone. Et le drain qui vient de nous claim ne peut pas
     * boucler dessus — son propre seuil est plus HAUT que ce plancher, il sortira de
     * sa boucle au même tour.
     *
     * Mêmes invariants que le refus d'admission de MIN-212 : ni `continuations`
     * (rien n'a été joué) ni `checkpoint` (rien n'a bougé) ne sont touchés, et
     * `attempts` repart à zéro — le budget de reprise sur crash sert aux chunks qui
     * MEURENT, pas à ceux qui rendent la main.
     */
    const afterSetupMs = opts.deadlineMs - (Date.now() - callStart);
    if (afterSetupMs < CHUNK_FLOOR_MS) {
      await stampRun(run.id, {
        status: "queued",
        not_before: new Date().toISOString(),
        attempts: 0,
        last_activity_at: new Date().toISOString(),
      });
      // Event `status` neutre, invisible dans le fil (pas de `sandbox_ready` émis :
      // il ferait dire à la conversation que l'agent travaille alors qu'il rend la
      // main). Comptable en base, comme `subagent_resume` : c'est lui qui dira
      // combien d'amorçages débordent, et de combien.
      await emit("status", {
        phase: "chunk_deferred",
        reason: "cold_setup",
        budgetMs: afterSetupMs,
      });
      return "suspended";
    }

    // La machine est là. C'est la seule chose que le fil ne pouvait pas deviner :
    // entre le `status: running` du haut de ce chunk et le premier pas de l'agent,
    // il se passe plusieurs secondes de réveil de microVM et de clone — le fil
    // affichait « travaille » alors que personne ne travaillait encore. Cet event
    // ferme cette fenêtre : avant lui « ouverture de la sandbox », après lui le
    // travail (cf. `sandboxReady` dans components/agent/agent-event-feed.tsx).
    await emit("status", { phase: "sandbox_ready" });

    // La branche est-elle DÉJÀ sur le remote ? Vrai quand la run hérite d'une
    // lignée (`launchAgentRun` ne transmet que des branches poussées) ou qu'un
    // chunk précédent a poussé. Sert à ne stamper qu'une fois.
    // `!writesToRepo` : une relecture ne poussera jamais, donc elle n'a aucune
    // branche à enregistrer — la marquer déjà stampée est un garde-fou de plus.
    let branchStamped = run.branch_name != null || !writesToRepo;
    /**
     * Enregistre la branche de travail au premier push qui a VRAIMENT eu lieu :
     * c'est ce push qui la crée sur le dépôt, donc c'est lui qui la fait exister
     * pour l'app. Un push sauté (rien de commité) ne stampe rien.
     */
    const noteBranchPushed = async (pushed: { pushed: boolean } | null): Promise<void> => {
      if (!pushed?.pushed || branchStamped) return;
      // Best-effort : le travail est DÉJÀ sur le dépôt à ce stade — un stamp raté
      // ne doit pas faire échouer un tour abouti. Le prochain push réessaie.
      const stamped = await stampRun(run.id, { branch_name: workBranch }).catch((err) => {
        console.error("[agent-execute] branch stamp failed:", (err as Error).message);
        return null;
      });
      branchStamped = stamped != null;
    };

    // Baseline du « diff par tour » (MIN-46, event `files_changed`) : HEAD à l'entrée
    // du chunk. `filesFromSha` est le point depuis lequel la fin de tour diffe — le
    // dernier sha émis (persisté dans le checkpoint, survit aux chunks WIP), ou ce
    // baseline au tout premier chunk du run (« rien de changé encore »).
    const baselineHead = await revParseHead(sandbox);
    const filesFromSha = run.checkpoint?.lastFilesSha ?? baselineHead;

    // Endpoint du run (BYOK de l'utilisateur, ou clé plateforme OpenRouter).
    // Résolu AVANT l'amorce de l'historique : le prompt système ne décrit que les
    // tools réellement offerts, et web_search en dépend.
    const { apiKey, baseUrl, provider } = await resolveAgentApiKey(run.created_by);

    // Recherche web : réservée aux runs qui parlent à OpenRouter (quota minddy ou
    // BYOK OpenRouter — la recherche part alors sur la MÊME clé que le run, donc
    // sur la même facture). Ailleurs le tool n'est pas offert (cf. agentToolsFor).
    // Plafond par chunk, et une ligne `web_search` au ledger par recherche.
    const webSearchAllowed = provider === "openrouter" && (await isWebSearchEnabled());
    let webSearchesUsed = 0;
    const webSearch: WebSearchHandler = webSearchAllowed
      ? async (query: string) => {
          if (webSearchesUsed >= MAX_WEB_SEARCHES_PER_TURN) {
            return {
              result: {
                error: `Web search limit reached for this turn (${MAX_WEB_SEARCHES_PER_TURN} searches). Work with what you already found.`,
              },
              success: false,
            };
          }
          // `seq` unique dans le run : le compteur repart à zéro à chaque chunk,
          // d'où la tranche par continuation (même règle que sandbox_compute).
          const seq =
            WEB_SEARCH_SEQ_BASE +
            run.continuations * MAX_WEB_SEARCHES_PER_TURN +
            webSearchesUsed;
          webSearchesUsed++;
          return await runWebSearchTool({
            query,
            apiKey,
            runId: run.run_id ?? run.id,
            seq,
            billTo: runBillTo,
            projectId: run.project_id,
          });
        }
      : null;

    // Le modèle du run VOIT-IL les images (MIN-111) ? Résolu ici, avant l'amorce,
    // pour la même raison que web_search : le prompt ne doit décrire que ce que le
    // run sait vraiment faire. C'est aussi ce qui autorise `read_resource` à
    // renvoyer une maquette au lieu de sa fiche signalétique.
    const imageInput = await supportsImageInput(run.model, provider, apiKey).catch(() => false);

    // Sous-agents (MIN-112) : réglages résolus ICI, avant l'amorce, pour la même
    // raison que `web_search` et les images — le prompt système ne doit décrire que
    // ce que le run sait vraiment faire.
    //
    // Le choix du MODÈLE d'un sous-agent suit la même règle du tout ou rien que
    // `web_search` : un run BYOK Anthropic ne peut pas faire tourner `deepseek/…`,
    // donc hors OpenRouter le champ `model` disparaît du schéma et la fille hérite
    // du modèle du parent. Le catalogue n'est chargé que dans ce cas (il est caché
    // une heure et ne lève jamais) : c'est lui qui valide un id, et il FILTRE sur le
    // tool-calling — un sous-agent qui ne sait pas appeler d'outil ne peut rien faire.
    const subagentModels = provider === "openrouter";
    const [rawFavorites, subagentMaxParallel, subagentCatalog] = await Promise.all([
      getSubagentFavorites().catch(() => []),
      maxParallelSubagents().catch(() => 2),
      subagentModels && run.created_by
        ? getAgentModelsForUser(run.created_by).catch(() => null)
        : Promise.resolve(null),
    ]);
    // Le plafond de modèle du plan vaut AUSSI pour les filles : le catalogue
    // servi ici est déjà passé au tamis, et les favoris hors plafond sortent du
    // prompt. Sans ça, `spawn_agent` rouvrait par le bas ce que le picker ferme
    // par le haut — sur le quota minddy, et décidé par un modèle.
    const subagentScope = scopeSubagentModels({
      favorites: rawFavorites,
      catalog: subagentCatalog ?? { models: [], maxMultiplier: null },
    });
    const subagentFavorites = subagentScope.favorites;

    // Rehydrate ou amorce l'historique. L'amorce est CONVERSATIONNELLE : contexte
    // (dépôt + ticket) puis, en DERNIER message utilisateur, la demande réelle du
    // lanceur — l'agent répond à elle, le ticket n'est que son ancrage.
    let messages: AgentChatMessage[];
    /** Contexte de PR chargé à l'amorce (null hors relecture, ou sur un chunk repris). */
    let prBoot: Awaited<ReturnType<typeof loadPrReviewBoot>> | null = null;
    let usageSeqStart = run.checkpoint?.usageSeq ?? run.continuations * 1000;
    // Instructions repo déjà servies : reprises du checkpoint sur un tour éclaté en
    // plusieurs chunks, sinon vides — l'amorce les remplit juste en dessous (MIN-115).
    const instructions: InstructionsState = {
      paths: [...(run.checkpoint?.instructions?.paths ?? [])],
      bytes: run.checkpoint?.instructions?.bytes ?? 0,
    };
    if (run.checkpoint?.messages?.length) {
      messages = run.checkpoint.messages;
    } else {
      // Ce qu'une relecture ne peut PAS lire dans la sandbox : le ticket, la
      // discussion déjà tenue sur la PR, la CI, le sommaire des fichiers. Chargé
      // ICI seulement (amorce à froid) : un chunk repris a tout ça dans son
      // checkpoint, et repayer six appels de forge pour le réécrire à l'identique
      // serait du réseau pour rien.
      prBoot = prRun
        ? await loadPrReviewBoot({
            forge,
            call: {
              token: target.token,
              repoFullName: target.repoFullName,
              number: prRun.number,
            },
            pr: prRun,
          })
        : null;
      // Le sha VRAIMENT relu, tel que la forge vient de le donner : celui posé au
      // lancement vient de `pull_requests.head_sha`, qui date du dernier webhook
      // et peut être en retard (ou absent). C'est ce sha-ci que « relancer
      // aurait-il quelque chose de neuf à lire ? » doit comparer.
      if (prBoot?.headSha && prBoot.headSha !== run.pr_head_sha) {
        await stampRun(run.id, { pr_head_sha: prBoot.headSha });
      }
      const system = buildAgentSystemPrompt({
        locale: commentLocale,
        anchor,
        // Un passage de ROUTINE (MIN-185) : le prompt cesse de décrire
        // `ask_user`, que le jeu de tools ne sert pas, et dit le mandat de PR.
        interactive: !run.routine_id,
        webSearch: webSearchAllowed,
        applyPatch: usesApplyPatch(run.model),
        images: imageInput,
        // Une relecture ne délègue pas : le bloc ne doit pas exister, sans quoi
        // le prompt décrirait des tools que le jeu de relecture n'a pas.
        ...(writesToRepo
          ? {
              subagents: {
                favorites: subagentFavorites,
                models: subagentModels,
                maxMultiplier: subagentScope.maxMultiplier,
              },
            }
          : {}),
      });
      const contextMsg = prRun
        ? buildPrReviewContextMessage({
            repo: { fullName: target.repoFullName },
            pr: {
              number: prRun.number,
              title: prRun.title,
              body: prBoot?.body ?? null,
              state: prRun.state,
              headBranch: prRun.headBranch,
              baseBranch,
              term: prTerm(target.provider),
            },
            issue: prBoot?.issue ?? null,
            files: prBoot?.files ?? [],
            filesTruncated: prBoot?.filesTruncated,
            comments: prBoot?.comments,
            reviews: prBoot?.reviews,
            lineThreads: prBoot?.lineThreads,
            checks: prBoot?.checks ?? null,
            // Le prompt du lanceur EST la demande d'une session de relecture (la
            // mention `@numo`, ou une consigne écrite au clic) : il se lit en tête
            // du contexte, pas comme un message de plus à la fin.
            question: run.prompt,
          })
        : issue
          ? buildAgentContextMessage({
              issue: {
                identifier: issue.identifier,
                title: issue.title,
                description: issue.description,
                plan: issue.plan,
              },
              repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
              projectName: issue.projectName,
              resources: issue.resources,
              images: imageInput,
              numoDefaultStatus,
            })
          : buildNotebookContextMessage({
              repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
              projectName: project.name,
              numoDefaultStatus,
            });
      messages = [
        { role: "system", content: system },
        { role: "user", content: contextMsg },
      ];
      // Session FROIDE héritant d'une PR (MIN-68) : elle n'a aucun checkpoint, mais
      // la branche porte déjà du travail. On lui donne sa seule mémoire de ce passé —
      // résumé de la session précédente, PR, fil de review — pour qu'elle itère au
      // lieu de tout refaire. Sans objet pour une relecture, qui n'a ni lignée ni
      // travail antérieur : son contexte de PR est déjà celui du dessus.
      const inheritedPr = writesToRepo
        ? await buildInheritedPrContext(run, {
            forge,
            token: target.token,
            repoFullName: target.repoFullName,
            repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
          })
        : null;
      if (inheritedPr) messages.push({ role: "user", content: inheritedPr });
      // Instructions du dépôt (AGENTS.md / CLAUDE.md) — message dédié après le contexte.
      // La racine est TOUJOURS marquée vue, trouvée ou non : ce qui suit ne recharge
      // que les sous-dossiers, à la première édition dedans (MIN-115).
      const repoInstructions = await readRepoInstructions(sandbox);
      instructions.paths.push(...REPO_INSTRUCTION_FILES);
      if (repoInstructions) {
        messages.push({ role: "user", content: repoInstructions.message });
        instructions.bytes += repoInstructions.bytes;
      }
      // La demande du lanceur, en dernier : c'est À ELLE que l'agent répond.
      // Run CARNET : la note part emballée dans la MÊME structure que « copier
      // le prompt » du carnet (balises <notes>, sémantique des cases, « ce sont
      // des notes personnelles, pas une spec — demande avant de deviner »), SANS
      // le bloc MCP : ses tools natifs (read_scratchpad…) le remplacent. La bulle
      // de la conversation affiche `run.prompt` (la note brute) — le wrapper est
      // de la plomberie, pas du contenu utilisateur.
      // Une relecture n'a PAS de message final : sa demande est déjà en tête de
      // son contexte (« What you were asked »), et la répéter ici la ferait lire
      // deux fois.
      if (run.prompt?.trim() && !prRun) {
        messages.push({
          role: "user",
          content: issue
            ? run.prompt.trim()
            : buildScratchpadPrompt(run.prompt.trim(), { mcp: false }),
        });
      }
    }

    // État PR de la session, MUTÉ pendant le tour (create_pr, réouverture au push) :
    // la fin de tour lit l'état à jour, pas celui figé au claim.
    const prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] } = {
      number: run.pr_number,
      url: run.pr_url,
      state: run.pr_state,
    };

    /**
     * Trace un geste de Numo sur la PR dans le journal d'activité du ticket.
     *
     * L'acteur en base est l'auteur du run (il faut un utilisateur réel), mais
     * `via_assistant` fait dire NUMO à la timeline — c'est lui qui a agi, et la
     * règle d'identité vaut dans les deux sens. `from_value` ne porte pas de
     * login mais le PROVIDER (cf. `forgeActorValue`), sans quoi une merge request
     * GitLab se raconterait en vocabulaire GitHub.
     */
    const recordAgentPrEvent = async (
      type: "pr_opened" | "pr_reopened" | "pr_committed",
      prNumber: number,
    ): Promise<void> => {
      if (!run.issue_id || !run.created_by) return;
      await insertEvents(getServiceClient(), [
        {
          issue_id: run.issue_id,
          actor_id: run.created_by,
          type,
          from_value: forgeActorValue(target.provider, null),
          to_value: String(prNumber),
          via_assistant: true,
        },
      ]);
    };

    /**
     * « Numo a commité sur la PR #12 » — un push qui a fait AVANCER la branche
     * distante, et seulement quand une PR le porte : avant elle, les commits
     * n'appartiennent à rien que le ticket puisse nommer.
     *
     * `remoteUpdated` et non `pushed` : un push qui ne pousse rien de neuf (le
     * remote était déjà à jour) n'est pas un fait.
     */
    const notePrCommits = async (
      pushed: { remoteUpdated: boolean } | null,
    ): Promise<void> => {
      if (!pushed?.remoteUpdated || prState.number == null) return;
      await recordAgentPrEvent("pr_committed", prState.number);
    };

    /** Enregistre une PR ouverte/rouverte : état local + stamp + statut d'issue +
     *  event live + commentaire d'issue (le SEUL commentaire du nouveau modèle). */
    const registerPr = async (
      pr: PullRequestRef,
      kind: "opened" | "reopened",
    ): Promise<void> => {
      prState.number = pr.number;
      prState.url = pr.url;
      // Le MÊME calcul que celui qui alimente `pull_requests` dix lignes plus
      // bas (MIN-164) : le run le refaisait à la main, sans lire `draft`, et les
      // deux colonnes d'état divergeaient dès qu'une PR brouillon passait par
      // ici — rouverte, ou déjà ouverte par un humain sur la branche du run.
      prState.state = prStateFromRef(pr);
      await emit("pr_opened", { number: pr.number, url: pr.url });
      await stampRun(run.id, {
        pr_number: pr.number,
        pr_url: pr.url,
        pr_state: prState.state,
      });
      // La PR est une ENTITÉ (MIN-143) : elle entre dans `pull_requests` ici,
      // sans attendre l'écho du webhook — qui n'arrive jamais en dev, et que la
      // page Pull Requests lit désormais au lieu d'`agent_runs`. Le run, lui, est
      // la meilleure source du ticket : il le SAIT, là où l'ingestion webhook
      // doit le déduire du nom de branche.
      const prRow = await upsertPullRequest({
        provider: target.provider,
        repoFullName: target.repoFullName,
        number: pr.number,
        state: prStateFromRef(pr),
        url: pr.url,
        title: pr.title ?? null,
        authorLogin: pr.user?.login ?? null,
        authorAvatarUrl: pr.user?.avatar_url ?? null,
        headBranch: pr.head ?? workBranch,
        baseBranch: pr.base ?? baseBranch,
        headSha: pr.headSha ?? null,
        openedAt: pr.createdAt ?? null,
        mergedAt: pr.mergedAt ?? null,
        updatedAt: pr.updatedAt,
        issueId: run.issue_id,
      });
      // Inbox : le projet apprend qu'une pull request attend des yeux. Ici et
      // pas au webhook — celui-ci n'arrive jamais en dev, et l'ouverture faite
      // par Numo porte le compte de l'App, que les récepteurs écartent comme
      // écho. La réouverture, elle, ne s'annonce pas : la PR était déjà connue.
      if (kind === "opened") await notifyPullRequestOpened(prRow);
      // Run CARNET : aucun ticket à synchroniser ni à commenter — la PR vit dans
      // la conversation de la session (et sur la page Pull requests).
      if (issue && run.issue_id) {
        if (run.created_by) {
          await syncIssueStatusFromPr({
            issueId: run.issue_id,
            actorId: run.created_by,
            prState: prState.state,
          });
        }
        // « Numo a ouvert la pull request #12 » dans le journal d'activité. Émis
        // ICI et pas par le webhook : la PR part du token de l'App (GitHub) ou du
        // compte qui a lié le dépôt (GitLab), donc l'écho porte une identité de
        // machine ou celle d'un tiers — or c'est Numo qui a ouvert. Les deux
        // récepteurs écartent d'ailleurs leur propre écho.
        // Ouvrir et ROUVRIR sont deux faits distincts (MIN-164) : la réouverture
        // ne se racontait pas du tout, et le ticket repassait en revue sans que
        // rien ne dise ce qui l'y avait remis.
        await recordAgentPrEvent(kind === "opened" ? "pr_opened" : "pr_reopened", pr.number);
        await postPrComment(run, issue.identifier, kind, pr.url, commentLocale, target.provider);
      }
    };

    /**
     * Tool `create_pr` : la création de PR est une DÉCISION (de l'agent ou de
     * l'utilisateur), plus un automatisme de fin de tour. Pousse d'abord le travail
     * du tour, puis : PR déjà vivante → no-op informatif (le push l'a mise à jour) ;
     * PR refusée → réouverture (règle produit : on réitère la dernière PR, jamais de
     * doublon) ; sinon → création. Une PR mergée n'est jamais réutilisée.
     */
    const createPr: CreatePrHandler = async ({ title, body }) => {
      const prTitle =
        title ||
        (issue
          ? `${issue.identifier}: ${issue.title}`
          : // Run carnet : la première ligne de la note fait office de titre.
            commitMessageFromReply(run.prompt ?? "", commitRef));
      const fresh = (await resolveRepoCloneTarget(run.project_id).catch(() => null)) ?? target;
      // Les jobs de fond meurent AVANT de stager, comme aux deux autres `git add -A`
      // du chunk (fin de tour, push WIP) : un serveur de dev ou un watcher encore
      // vivant réécrirait des fichiers pendant l'indexation. C'est `backgroundJobs`
      // et pas `background` — la closure est construite AVANT le registre, seul le
      // `let` du haut est lisible d'ici. Et on le DIT au modèle sur chacune des
      // sorties : un serveur tué en silence lui laisse croire qu'il tourne (MIN-209).
      const stoppedJobs = (await backgroundJobs?.stopAll().catch(() => 0)) ?? 0;
      const jobsNote =
        stoppedJobs === 0
          ? ""
          : `${stoppedJobs === 1 ? "1 background job was" : `${stoppedJobs} background jobs were`} stopped ` +
            `before staging — nothing may write to the repository while it is being committed. Restart what you still need.`;
      const andJobs = (text: string) => (jobsNote ? `${text} ${jobsNote}` : text);
      let pushed: Awaited<ReturnType<typeof commitAndPush>>;
      try {
        pushed = await commitAndPush(sb, {
          authUrl: fresh.authUrl,
          workBranch,
          baseBranch,
          message: prTitle,
        });
      } catch (err) {
        return {
          result: { error: andJobs(`push failed: ${(err as Error).message}`) },
          success: false,
        };
      }
      // Rien de commité par-dessus la base : on s'arrête AVANT de toucher au dépôt
      // (MIN-123). Pousser créerait une branche vide pour rien — et la forge
      // refuserait la PR (422) juste après, en la laissant derrière elle.
      if (!pushed.pushed) {
        return {
          result: {
            error: andJobs(
              "Nothing to open a pull request for: this session hasn't changed any file yet. Do the work first, then call create_pr.",
            ),
          },
          success: false,
        };
      }
      await noteBranchPushed(pushed);
      // `create_pr` sur une PR qui existe DÉJÀ : ce push l'alimente, il se trace
      // comme les autres. Sur une PR encore à ouvrir, `prState.number` est nul et
      // rien ne se trace — c'est `registerPr` qui dira « a ouvert la PR ».
      await notePrCommits(pushed);
      if (prState.number != null) {
        const current = await forge
          .getPullRequest({
            token: fresh.token,
            repoFullName: fresh.repoFullName,
            number: prState.number,
          })
          .catch(() => null);
        if (current?.merged) {
          return {
            result: {
              error: andJobs(
                `Pull request #${prState.number} is already merged — this branch's work is shipped. A new session on this ticket will start a fresh branch and pull request.`,
              ),
            },
            success: false,
          };
        }
        if (current && current.state !== "closed") {
          return {
            result: {
              number: current.number,
              url: current.url,
              note: andJobs(
                "A pull request already exists for this branch — your pushes update it automatically; nothing was created.",
              ),
            },
            success: true,
          };
        }
        if (current && current.state === "closed") {
          const reopened = await forge
            .reopenPullRequest({
              token: fresh.token,
              repoFullName: fresh.repoFullName,
              number: prState.number,
            })
            .catch((err) => {
              console.error("[agent-execute] PR reopen failed:", (err as Error).message);
              return null;
            });
          if (reopened) {
            await registerPr(reopened, "reopened");
            return {
              result: {
                number: reopened.number,
                url: reopened.url,
                note: andJobs("The rejected pull request was reopened with the new work."),
              },
              success: true,
            };
          }
        }
        // PR illisible / réouverture impossible (branche tête supprimée puis
        // recréée par notre push…) → on retombe sur une création propre.
      }
      const prBody = `${body?.trim() || prTitle}\n\n---\n🤖 Généré par l'agent numo (minddy) · ${issue ? `issue ${issue.identifier}` : "note du carnet"}`;
      try {
        const pr = await forge.ensurePullRequest({
          token: fresh.token,
          repoFullName: fresh.repoFullName,
          head: workBranch,
          base: baseBranch,
          title: prTitle,
          body: prBody,
        });
        await registerPr(pr, "opened");
        return {
          result: { number: pr.number, url: pr.url, ...(jobsNote ? { note: jobsNote } : {}) },
          success: true,
        };
      } catch (err) {
        if (isForgeApiError(err) && err.status === 422) {
          return {
            result: {
              error: andJobs(
                "The branch has no changes compared to the base branch — there is nothing to open a pull request for.",
              ),
            },
            success: false,
          };
        }
        return { result: { error: andJobs((err as Error).message) }, success: false };
      }
    };

    /**
     * Recale `prState` sur la BASE : les actions in-app (merge/reject pendant que
     * l'agent tourne) et le webhook GitHub stampent `agent_runs.pr_state`, invisible
     * du snapshot pris au claim. Sans ce recalage, un reject mid-turn ne serait
     * jamais rouvert au push, et un merge mid-turn passerait inaperçu.
     */
    const refreshPrStateFromDb = async (): Promise<void> => {
      const db = await getRun(run.id).catch(() => null);
      if (!db) return;
      prState.number = db.pr_number;
      prState.url = db.pr_url;
      prState.state = db.pr_state;
    };

    /**
     * La session suit une PR REFUSÉE et un push vient de faire AVANCER le remote →
     * on la ROUVRE (règle produit : on réitère toujours la dernière PR du ticket,
     * jamais de doublon). Appelé après CHAQUE push — fin de tour ET push WIP de
     * mi-tour : sur un tour multi-chunks, ce sont les WIP qui portent les commits.
     * Décision sur `remoteUpdated` (le remote a bougé), pas `committed` : un commit
     * posé à un appel précédent (push 5xx) part avec un arbre propre au suivant.
     * Une PR mergée n'est jamais ressuscitée (le reopen échoue → on n'insiste pas).
     * Best-effort.
     */
    const reopenIfRejectedWorkPushed = async (
      pushed: { remoteUpdated: boolean } | null,
      token: string,
    ): Promise<void> => {
      if (!pushed?.remoteUpdated) return;
      await refreshPrStateFromDb();
      if (prState.number == null || prState.state !== "closed") return;
      const reopened = await forge
        .reopenPullRequest({
          token,
          repoFullName: target.repoFullName,
          number: prState.number,
        })
        .catch((err) => {
          console.error("[agent-execute] PR reopen on push failed:", (err as Error).message);
          return null;
        });
      if (reopened && !reopened.merged) await registerPr(reopened, "reopened");
    };

    // Fenêtre de contexte du modèle (OpenRouter) → seuil de compaction adapté.
    const contextWindow = await getModelContextWindow(run.model, provider, apiKey).catch(() => null);

    // Budget du chunk : temps restant du drain − marge, borné par la config.
    const softDeadlineMs = chunkSoftDeadlineMs(opts.deadlineMs, Date.now() - callStart);

    // Contextes des tools métier, construits côte à côte : les deux jeux sont
    // servis quel que soit l'ancrage (MIN-125). Ce que l'ancrage décide encore,
    // c'est `anchorIssueId` — la cible par défaut des tools ticket.
    //
    // Sur une RELECTURE, ce défaut est le ticket que la PULL REQUEST met en
    // œuvre : `run.issue_id` est toujours nul (une session de review n'occupe
    // pas un ticket), mais la PR, elle, en porte souvent un — et c'est ce
    // ticket-là que l'agent veut lire quand il compare le code au plan. Sans
    // cette ligne, le tool annoncerait un défaut qui n'existe pas et le premier
    // `read_issue` sans argument brûlerait un round.
    //
    // Une PR sans ticket (le cas normal d'une PR humaine, MIN-143) laisse le
    // défaut nul : `issue` redevient obligatoire, ce que le tool dit aussi.
    const issueToolCtx: IssueToolContext = {
      anchorIssueId: run.issue_id ?? prRun?.issueId ?? null,
      projectId: run.project_id,
      projectKey: issue?.projectKey ?? project.key,
      actorId: run.created_by,
      numoDefaultStatus,
      imageInput,
      // `report_verdict` (MIN-147) écrit sur CE run, et n'est servi que si le
      // run est une étape de chaîne.
      runId: run.id,
      chainId: run.chain_id,
    };
    const scratchpadToolCtx: ScratchpadToolContext = { userId: run.created_by };

    /**
     * Les trois écritures de PR (MIN-168), câblées comme `create_pr` : la forge du
     * provider et le token de `resolveRepoCloneTarget` — Numo commente sous
     * l'identité de minddy, jamais sous celle d'un humain (cf. la table
     * d'identité de `forge.ts`).
     *
     * `files()` est PARESSEUX et mémoïsé : la validation d'ancre en a besoin, un
     * tour qui ne commente aucune ligne n'a aucune raison de le payer, et un chunk
     * repris n'a pas de `prBoot` à réutiliser. On re-résout un token frais à
     * l'appel — un chunk peut durer plus longtemps que le token du claim.
     */
    let prFilesCache: Promise<ReviewableFile[]> | null = prBoot
      ? Promise.resolve(prBoot.files)
      : null;
    const prToolCtx: PrToolContext | null = prRun
      ? {
          forge,
          call: {
            token: target.token,
            repoFullName: target.repoFullName,
            number: prRun.number,
          },
          files: () => {
            prFilesCache ??= (async () => {
              const fresh =
                (await resolveRepoCloneTarget(run.project_id).catch(() => null)) ?? target;
              const { files } = await forge.listPullRequestFiles({
                token: fresh.token,
                repoFullName: fresh.repoFullName,
                number: prRun.number,
              });
              return files;
            })();
            return prFilesCache;
          },
          model: run.model,
          locale: commentLocale,
          // Compteur d'ancres du RUN, semé depuis le checkpoint : c'est ce qui rend
          // le plafond de 5 insensible à la reprise et au tour suivant.
          inline: { used: run.checkpoint?.prInlineComments ?? 0 },
        }
      : null;

    // Jobs de fond du chunk (MIN-114). Ils meurent AVANT chaque push (un watcher
    // qui écrit pendant le `git add -A` commiterait n'importe quoi) et de toute
    // façon en fin de chunk (`finally`) : un processus oublié mangerait la microVM
    // jusqu'au reaper, et serait encore là au tour suivant sans que le modèle le
    // sache. Le registre ne survit pas au chunk — c'est assumé, et le tool le dit.
    const background = new BackgroundJobs(
      sandboxBackgroundRunner(sandbox),
      run.continuations * 1000,
    );
    backgroundJobs = background;

    // Fichiers édités depuis le dernier type-check (MIN-110). Vidé à chaque check :
    // un tour qui ne touche à rien après coup n'en relance pas un second. PARTAGÉ
    // avec les sous-agents (MIN-112) : c'est ce que le type-check lit, et une fille
    // qui casse un type doit le faire dire avant que le parent ne réponde.
    //
    // SEMÉ depuis le checkpoint (MIN-210), comme `instructions` et `lastFilesSha` :
    // c'est de l'état de TOUR, et un tour qui déborde d'un chunk doit type-checker
    // ce qu'il a édité AVANT la soft-deadline. Le chemin `completed` ne l'écrit pas
    // (le tour y est fini), donc le semis reste vide au premier chunk d'un tour.
    const editedPaths = new Set<string>(run.checkpoint?.editedPaths ?? []);

    // Budget d'usage RESTANT à l'entrée du chunk. Snapshoté une fois ici : la
    // boucle compare son coût accumulé à ce restant, sans relire l'usage à chaque
    // round. En BYOK, `unlimited` → aucun plafond (l'utilisateur paie sa note).
    //
    // Deux lectures, une seule attente : la somme du ledger (cf. `runSpentUsd`)
    // ne dépend pas du quota, elle part avec lui.
    const [quotaNow, ledgerSpentUsd] = await Promise.all([
      checkAgentQuota(run.created_by ?? "").catch(() => null),
      spentFromLedger(run.run_id ?? run.id),
    ]);
    // Deux plafonds, le plus serré gagne : le QUOTA du compte, et celui que
    // l'appelant a éventuellement posé sur CE run. Une chaîne d'automatisation
    // n'en ajoute PAS un troisième (MIN-147) : la couper au milieu laisserait un
    // ticket à moitié fait sans explication lisible — c'est le quota, global et
    // visible, qui borne la dépense.
    //
    // Calculé AVANT `subagentRunner`, et pas juste avant la boucle : la closure du
    // runner le LIT, et `resumeSuspended()` l'appelle SYNCHRONEMENT — une fille
    // reprise n'a aucun `await` avant l'objet passé à `runAgentLoop`. Déclaré plus
    // bas, `budgetUsd` était alors dans sa zone morte temporelle, et la reprise
    // mourait sur un `ReferenceError` (MIN-169). L'invariant — rien de ce que la
    // closure capture ne se déclare après elle — est tenu par
    // `subagent-runner-init.test.ts`.
    /** Ce qu'il reste du budget d'usage du COMPTE. `undefined` en BYOK. */
    const accountRemainingUsd =
      quotaNow && !quotaNow.unlimited ? Math.max(0, quotaNow.remaining ?? 0) : undefined;
    /**
     * Ce que le run a déjà dépensé, tous chunks joués confondus — le montant que
     * son plafond déduit.
     *
     * LU AU LEDGER (MIN-215), plus à la seule colonne `cost_usd` : celle-ci n'est
     * écrite que par les chemins de sortie SAINS d'ici, donc un chunk qui lève au
     * milieu (un `commitAndPush` qui échoue) ou dont l'invocation est tuée à la
     * limite de durée n'y porte jamais sa dépense — et le plafond se rechargeait
     * d'autant. Un passage à 0,75 $ dont le chunk 2 mourait après 0,40 $ repartait
     * au chunk 3 avec un restant qui n'existait plus, et finissait au-dessus de
     * son plafond. Le ledger, lui, est écrit APPEL PAR APPEL, avant l'accident :
     * c'est déjà la doctrine du quota du compte, qui pour cette raison exacte ne
     * souffrait pas du problème (`checkAgentQuota` relit l'usage réel à chaque
     * chunk). La somme porte aussi les lignes `sandbox_compute` : le plafond voit
     * enfin la moitié microVM de la facture.
     *
     * Le MAX des deux, et pas le ledger seul : `recordAiUsage` est best-effort
     * (il avale ses erreurs), donc une insertion ratée laisserait au ledger moins
     * que ce que la colonne porte. Les deux sont des MINORANTS de la dépense
     * réelle — le plus grand est le plus vrai. Même raison pour le repli sur la
     * colonne quand la lecture échoue : jamais pire qu'avant.
     */
    const runSpentUsd = Math.max(run.cost_usd, ledgerSpentUsd ?? 0);
    /**
     * Ce qu'il reste du plafond posé sur CE run — DÉDUCTION FAITE des chunks
     * déjà joués. Sans cette soustraction le plafond se rechargeait à chaque
     * continuation : la boucle compare son coût de CHUNK au budget, et un run en
     * cinq chunks aurait dépensé cinq fois son plafond.
     */
    const runCapRemainingUsd =
      run.budget_usd == null ? undefined : Math.max(0, Number(run.budget_usd) - runSpentUsd);
    const budgetUsd = minDefined(accountRemainingUsd, runCapRemainingUsd);
    /**
     * Ce que le chunk a dépensé, TOUTES boucles confondues — le compteur que
     * `budgetUsd` plafonne (MIN-202). Un seul objet pour le parent et ses filles :
     * elles tournent dans le même process, chacune l'incrémente en payant, et le
     * plafond est donc opposé à la dépense RÉELLE du passage.
     *
     * Le scalaire seul ne bornait rien : recopié à chaque fille, il donnait à
     * chacune le droit de dépenser le plafond entier. Six filles en parallèle plus
     * le parent, et une routine réglée à 15 % d'un plan Go (0,75 $) pouvait en
     * prendre 5,25 $ — tout le mois de l'utilisateur en un passage.
     *
     * Déclaré ICI, au-dessus de `subagentRunner`, pour la même raison que
     * `budgetUsd` : la closure le lit et `resumeSuspended()` l'appelle
     * synchronement (cf. `subagent-runner-init.test.ts`).
     */
    const chunkSpend = { usd: 0 };

    // ── Sous-agents (MIN-112) ──────────────────────────────────────────────────
    /** Chrono de la boucle : le budget restant du chunk borne chaque sous-agent. */
    let loopStartedAt = Date.now();
    const chunkRemainingMs = () => softDeadlineMs - (Date.now() - loopStartedAt);

    /**
     * Instructions du dépôt (AGENTS.md / CLAUDE.md à la racine) pour un sous-agent
     * qui ÉCRIT. Le parent les a reçues à son amorce ; une fille, non — son
     * historique n'est que son prompt système et sa tâche. Sans elles, un
     * `implement` écrirait du code en ignorant les conventions du dépôt : exactement
     * ce que `withTouchedInstructions` existe pour éviter, sauf que le sous-agent
     * n'a même pas la racine. Un `explore` n'en a pas besoin (il ne produit rien
     * qui doive suivre une convention), donc il ne les paie pas.
     *
     * Lues UNE fois par chunk, à la première fille qui écrit (promesse mémoïsée) :
     * deux allers-retours sandbox, pas deux par sous-agent.
     */
    let repoInstructionsForSubagent: Promise<{ message: string; bytes: number } | null> | null =
      null;
    const subagentRepoInstructions = () => {
      repoInstructionsForSubagent ??= readRepoInstructions(sb).catch(() => null);
      return repoInstructionsForSubagent;
    };

    /**
     * Les mains d'un sous-agent : un SECOND appel de `runAgentLoop`, dans la MÊME
     * microVM, avec un jeu de tools restreint, son propre `messages`, et le
     * `runId`/`billTo`/`projectId` du parent (facturation). Pas de nouveau moteur.
     *
     * Ce que la fille ne partage PAS avec son parent, et pourquoi :
     *  - `emitLive` : `broadcastRunStream` diffuse sur le topic du RUN — une fille
     *    qui streame son texte ÉCRASERAIT la bulle en cours d'écriture du parent. Le
     *    fil la suit par ses events persistés, repliés, pas par le direct.
     *  - `InstructionsState` : partager celui du parent marquerait un `AGENTS.md`
     *    comme « déjà servi » alors qu'il ne l'a été qu'à la fille, dont le contexte
     *    meurt avec elle — le parent ne le lirait jamais.
     *  - `outputSeqBase` : deux exec-tools écriraient sinon le même `slug-<seq>.log`.
     *  - `createPr`, les tools minddy, le registre de jobs de fond : ils appartiennent
     *    au parent (et ne sont pas dans le schéma de la fille — c'est structurel).
     */
    const subagentRunner: SubagentRunner = {
      run: async (job): Promise<SubagentRunResult> => {
        /**
         * PLUS DE ROUNDS : la fille a épuisé son plafond cumulé. On la COUPE ici,
         * avec ce qu'elle a déjà écrit, plutôt que de la relancer.
         *
         * Sans ce retour, `maxRounds: Math.max(1, …)` lui rendait UN round à
         * chaque reprise : elle en jouait un, la boucle suspendait aussitôt
         * (`round >= maxRounds`), le parent se garait, le chunk se re-queuait —
         * et ça recommençait. Un zombie à un round par chunk, chacun payant son
         * réveil de microVM, jusqu'à ce que le garde-fou des 20 continuations
         * tue le tour entier. Observé les 07/08 sur les deux passages de routine
         * du projet minddy : dix-neuf chunks de 5 à 20 s pendant lesquels le
         * parent n'a pas dit un mot, puis « tour trop long ».
         *
         * La coupure, elle, remonte au parent par `drainReports()` : il reprend
         * la main dans le MÊME chunk, avec ce que sa fille avait trouvé.
         */
        const roundsLeft = subagentRoundsLeft(job.roundsSoFar);
        if (roundsLeft <= 0) {
          const partial = lastAssistantText(job.resumeMessages ?? []);
          return {
            report:
              partial ||
              `No report: the sub-agent hit its ${SUBAGENT_MAX_ROUNDS}-round limit before saying anything useful. Do the work yourself, or spawn one with a narrower task.`,
            rounds: job.roundsSoFar ?? 0,
            costUsd: job.costSoFar ?? 0,
            status: "cut",
          };
        }

        // Soft-deadline : tout ce qui reste au chunk MOINS la réserve du parent,
        // plafonné. Une fille peut donc travailler ~3 min par chunk — et REPRENDRE
        // au chunk suivant si elle n'a pas fini (cf. `resumeMessages`), ce qui la
        // libère du plafond de 300 s de la fonction Vercel.
        const budget = Math.min(
          SUBAGENT_MAX_MS,
          chunkRemainingMs() - SUBAGENT_PARENT_RESERVE_MS,
        );
        const model = job.model ?? run.model!;
        // REPRISE : on repart de l'historique sauvé, sans réamorcer prompt système
        // ni tâche (ils y sont déjà). Sinon, amorçage neuf.
        const childMessages: AgentChatMessage[] = job.resumeMessages?.length
          ? job.resumeMessages
          : [
              {
                role: "system",
                content: buildSubagentSystemPrompt({
                  mode: job.mode,
                  applyPatch: usesApplyPatch(model),
                  webSearch: webSearchAllowed,
                }),
              },
            ];
        if (!job.resumeMessages?.length) {
          // Conventions du dépôt, avant la tâche : une fille qui écrit doit les
          // connaître, et le message doit précéder ce sur quoi elle va travailler.
          if (job.mode === "implement") {
            const repoInstructions = await subagentRepoInstructions();
            if (repoInstructions) {
              childMessages.push({ role: "user", content: repoInstructions.message });
            }
          }
          childMessages.push({
            role: "user",
            content: `${job.prompt}\n\n## What your report must contain\n${job.expectedOutput}`,
          });
        }

        // Events de la fille : types EXISTANTS (`thinking`, `tool_call`,
        // `tool_result`, `status`) marqués `subagent_id` + `parent_call_id` — le
        // CHECK de `agent_run_events.type` n'a pas à bouger, et le fil replie ces
        // events sous la ligne `spawn_agent`. Les ids de tool-call sont PRÉFIXÉS :
        // deux modèles peuvent rendre le même `call_1`, et le fil apparie par id.
        const childEmit: EmitAgentEvent = (type, payload) => {
          if (type === "tool_call") job.onRound();
          const id = payload.id;
          return emit(type, {
            ...payload,
            ...(typeof id === "string" ? { id: `${job.id}:${id}` } : {}),
            subagent_id: job.id,
            ...(job.parentCallId ? { parent_call_id: job.parentCallId } : {}),
            subagent_mode: job.mode,
          });
        };

        const result = await runAgentLoop({
          messages: childMessages,
          tools: subagentToolsFor(job.mode, { webSearch: webSearchAllowed, model }),
          model,
          apiKey,
          baseUrl,
          provider,
          reasoningLevel: job.thinkingEffort ?? run.reasoning_level,
          runId: run.run_id ?? run.id,
          billTo: runBillTo,
          // Un sous-agent se facture AVEC SA MÈRE : lancé par une routine, il
          // s'écrit `routine_code` comme elle. Sa dépense est celle du passage.
          feature: usageFeature,
          projectId: run.project_id,
          softDeadlineMs: Math.max(1_000, budget),
          // Budget d'usage : le RESTANT snapshoté à l'entrée du chunk, opposé au
          // compteur PARTAGÉ du chunk. C'est ce partage qui fait le plafond : sans
          // lui, cette fille-ci comparerait sa seule dépense au plafond commun, et
          // ses cinq sœurs feraient de même, chacune dans son coin.
          budgetUsd,
          chunkSpend,
          contextWindow: job.model ? null : contextWindow,
          // Plafond CUMULATIF : une fille reprise ne repart pas avec quinze rounds
          // neufs à chaque chunk, sinon le garde-fou anti-runaway ne borne rien.
          // Toujours ≥ 1 ici : le cas « plafond atteint » est sorti plus haut, en
          // coupure — c'est ce qui rendait ce `max` dangereux.
          maxRounds: roundsLeft,
          usageSeqStart: job.resumeUsageSeq ?? subagentUsageSeq(job.slot),
          signal: job.signal,
          emit: childEmit,
          execTool: makeExecTool({
            sandbox: sb,
            createPr: null,
            // La pull request appartient au parent, comme le ticket et le carnet
            // (et une fille n'a de toute façon aucun de ces tools dans son schéma).
            prCtx: null,
            issueCtx: null,
            scratchpadCtx: null,
            webSearch,
            outputSeqBase: SUBAGENT_OUTPUT_SEQ_BASE + job.slot * 1000,
            background: null,
            // Racine marquée VUE (elle vient d'être servie en message ci-dessus) ;
            // le budget repart à zéro pour que la fille puisse charger les
            // instructions des sous-dossiers qu'elle édite, comme le parent.
            instructions: { paths: [...REPO_INSTRUCTION_FILES], bytes: 0 },
            editedPaths,
            subagents: null,
            // L'horloge du CHUNK, pas celle de la fille : ce qui tue la fonction
            // est la fin du chunk, et une commande lancée par une fille la tue
            // aussi sûrement qu'une commande du parent.
            chunkRemainingMs,
          }),
        });

        const rounds = (job.roundsSoFar ?? 0) + result.rounds;
        const costUsd = (job.costSoFar ?? 0) + result.costUsd;

        // SUSPENSION : la fille n'a pas fini, mais son état est sauvable — soit sa
        // propre soft-deadline a sonné, soit le chunk se termine et le harness le
        // lui a demandé (`isSuspending`). `result.messages` s'arrête au dernier
        // round COMPLET (la boucle ne pousse jamais un round partiel), donc c'est un
        // point de reprise sûr. Ce qui la rend possible : la microVM, elle, survit
        // au chunk (snapshot persistant) — seule la mémoire de la boucle mourait.
        if (result.status === "suspended" || job.isSuspending()) {
          const saved = capSubagentHistory(result.messages);
          if (saved) {
            return { report: "", rounds, costUsd, status: "suspended", messages: saved, usageSeq: result.usageSeqEnd };
          }
          // Historique trop gros pour le checkpoint : on dégrade honnêtement en
          // coupure — rapport partiel livré une fois, plutôt qu'une reprise promise
          // qui ferait exploser `MAX_CHECKPOINT_BYTES` et tuerait le tour entier.
          const partial = lastAssistantText(result.messages);
          return {
            report:
              partial ||
              "No report: the sub-agent was stopped and its state was too large to carry over to the next turn.",
            rounds,
            costUsd,
            status: "cut",
          };
        }

        // Le rapport : la réponse finale si la fille a conclu, sinon ce qu'elle a
        // écrit en dernier. Un sous-agent coupé a souvent déjà dit l'essentiel — le
        // jeter serait perdre le travail ET l'argent.
        const report = result.reply?.trim() || lastAssistantText(result.messages);
        const status: SubagentRunResult["status"] =
          result.status === "completed" ? "done" : result.status === "error" ? "error" : "cut";
        return {
          report:
            report ||
            (result.errorMessage
              ? `No report: the sub-agent's model failed (${cap(result.errorMessage, 300)}).`
              : "No report: the sub-agent produced nothing before it stopped."),
          rounds,
          costUsd,
          status,
        };
      },
    };

    const subagents = new Subagents(subagentRunner, {
      maxParallel: subagentMaxParallel,
      favorites: subagentFavorites,
      ...(subagentModels
        ? {
            resolveModel: makeSubagentModelResolver({
              favorites: subagentFavorites,
              catalogIds: subagentScope.allowedIds,
              abovePlanIds: subagentScope.abovePlanIds,
              maxMultiplier: subagentScope.maxMultiplier,
            }),
          }
        : {}),
      // Une tranche par continuation : les ids ET les bandes de seq `ai_usage`
      // restent uniques sur la vie du run, pas seulement du chunk.
      seqBase: run.continuations * MAX_SUBAGENTS_PER_CHUNK,
      budgetGuard: () => {
        const left = chunkRemainingMs();
        return left >= SUBAGENT_MIN_MS
          ? null
          : `Not enough time left in this turn to delegate (${Math.max(0, Math.round(left / 1000))}s): a sub-agent launched now would be cut off before it could report. Do what you can yourself and reply — you can delegate at the start of the next turn.`;
      },
    });
    subagentRegistry = subagents;
    subagents.restore(run.checkpoint?.subagents);
    // Filles SUSPENDUES au chunk précédent : elles repartent MAINTENANT, avec leur
    // historique, avant que la boucle du parent ne reprenne. Leurs rapports lui
    // arriveront par le même wakeup que d'habitude.
    const resumed = subagents.resumeSuspended();
    if (resumed > 0) await emit("status", { phase: "subagent_resumed", count: resumed });

    /** Le tour a-t-il édité le dépôt ? Verrou LATCHÉ, là où `editedPaths` se vide
     *  à chaque type-check : après une relance, le tour a toujours édité, même si
     *  le modèle n'a plus rien touché depuis. Semé depuis le checkpoint (MIN-210) :
     *  le verrou porte sur le TOUR, pas sur le chunk qui l'exécute. */
    let repoTouched = run.checkpoint?.repoTouched === true;
    /** L'auto-relecture ne passe qu'UNE fois par chunk : elle sert à faire relire
     *  le tour avant la réponse, pas à commenter chaque correctif qui suit. Celui-ci
     *  reste bien PAR CHUNK, et ne voyage pas : le faire traverser priverait de
     *  relecture le travail ajouté APRÈS une première passe. */
    let selfReviewed = false;

    /**
     * Type-check de fin de tour. Se tait — et coûte alors un aller-retour shell de
     * ~1 ms — dès que l'une des conditions manque : rien d'édité, pas de
     * `tsconfig.json`, pas de `node_modules/.bin/tsc`, ou pas assez de budget mural
     * pour absorber un check à froid (mesuré 22 s, cf. §3.3 du comparatif). Sinon,
     * les erreurs partent au modèle et le tour repart (plafond tenu par la boucle).
     * Best-effort de bout en bout : une panne du checker ne doit jamais empêcher un
     * tour de se terminer.
     */
    const typeCheckBlock = async (budgetMs: number): Promise<string | null> => {
      if (editedPaths.size === 0 || budgetMs < TYPECHECK_MIN_BUDGET_MS) return null;
      const touched = [...editedPaths];
      editedPaths.clear();
      const startedAt = Date.now();
      const block = await typeErrorsForTurn(sb, touched).catch((err) => {
        console.error("[agent-execute] turn-end typecheck failed:", (err as Error).message);
        return null;
      });
      // Event `status` (neutre : invisible dans le fil, comptable en base) — c'est
      // lui qui répond à « combien de tours se terminent avec des erreurs de typage
      // introduites par l'agent ? », la mesure que R4 réclamait. `errorsShown` est
      // le compte des erreurs SERVIES (le bloc est capé) : ce que le modèle a lu,
      // pas ce que tsc a trouvé.
      await emit("status", {
        phase: "type_check",
        durationMs: Date.now() - startedAt,
        files: touched.length,
        errorsShown: block ? block.split("\n").filter((l) => /error TS\d+/.test(l)).length : 0,
      });
      return block;
    };

    /**
     * Auto-relecture de fin de tour : le diff du tour, injecté avant que l'agent ne
     * réponde (cf. self-review.ts pour le pourquoi). Deux commandes git en lecture
     * seule — l'index n'est jamais touché, la fin de tour reste seule à stager.
     *
     * `filesFromSha` est la même baseline que le diff par tour émis au feed : elle
     * couvre le travail poussé en WIP au milieu du chunk aussi bien que ce qui
     * dort encore dans l'arbre de travail.
     */
    const selfReviewBlock = async (budgetMs: number): Promise<string | null> => {
      if (selfReviewed || !repoTouched || budgetMs < SELF_REVIEW_MIN_BUDGET_MS) return null;
      selfReviewed = true;
      const startedAt = Date.now();
      const { diff, porcelain } = await turnDiff(sb, filesFromSha).catch(() => ({
        diff: "",
        porcelain: "",
      }));
      const block = formatSelfReview({ diff, porcelain });
      await emit("status", {
        phase: "self_review",
        durationMs: Date.now() - startedAt,
        chars: block?.length ?? 0,
      });
      return block;
    };

    /**
     * Dernier mot du harness. Les erreurs de typage passent AVANT la relecture :
     * elles sont concrètes et bloquantes, et servir un diff par-dessus un dépôt qui
     * ne compile pas noierait le seul signal qui compte.
     */
    const onTurnEnd = async ({ budgetMs }: { budgetMs: number }): Promise<string | null> => {
      if (editedPaths.size > 0) repoTouched = true;
      return (await typeCheckBlock(budgetMs)) ?? (await selfReviewBlock(budgetMs));
    };

    // Chrono de la boucle : c'est depuis ici que se mesure le budget restant d'un
    // sous-agent (`chunkRemainingMs`).
    loopStartedAt = Date.now();

    const result = await runAgentLoop({
      messages,
      tools: agentToolsFor({
        anchor,
        webSearch: webSearchAllowed,
        model: run.model,
        images: imageInput,
        subagentModels,
        chain: !!run.chain_id,
        // Un passage de ROUTINE (MIN-185) perd `ask_user` (personne devant
        // l'écran) et `create_routine` (une routine ne s'auto-réplique pas).
        interactive: !run.routine_id,
      }),
      model: run.model,
      apiKey,
      baseUrl,
      provider,
      // Figé au lancement (MIN-122) : chaque chunk du run repart du même niveau.
      reasoningLevel: run.reasoning_level,
      runId: run.run_id ?? run.id,
      billTo: runBillTo,
      // La ligne de facture du run (MIN-185) : « Routines » et pas « Agents »
      // quand ce run est un passage de routine.
      feature: usageFeature,
      projectId: run.project_id,
      softDeadlineMs,
      budgetUsd,
      chunkSpend,
      contextWindow,
      execTool: makeExecTool({
        sandbox,
        // Une relecture n'ouvre pas de pull request : le tool n'est pas dans son
        // jeu, et le handler ne lui est pas non plus câblé (deux verrous, pas un).
        createPr: writesToRepo ? createPr : null,
        prCtx: prToolCtx,
        issueCtx: issueToolCtx,
        scratchpadCtx: scratchpadToolCtx,
        webSearch,
        outputSeqBase: run.continuations * 1000,
        background,
        instructions,
        editedPaths,
        subagents,
        chunkRemainingMs,
      }),
      onTurnEnd,
      pullSteering: () => pullPendingMessages(run.id),
      // Wakeup des sous-agents (MIN-112) : drainé au sommet de chaque round, comme
      // le steering. Le parent n'a jamais attendu — le rapport arrive tout seul.
      pullSubagentReports: async () => subagents.drainReports(),
      /**
       * Dernière chance de livrer AVANT que le tour ne se termine. Si le budget
       * tombe alors qu'une fille tourne encore, on la COUPE ICI plutôt qu'après la
       * boucle : ses fichiers doivent être dans `editedPaths` et dans le diff avant
       * que le type-check et l'auto-relecture ne parlent — sinon un sous-agent
       * casse les types en silence et le tour dit « c'est fait ».
       */
      awaitSubagents: async ({ budgetMs }) => {
        const waited = await subagents.awaitReports(
          Math.max(0, budgetMs - SUBAGENT_CUT_MARGIN_MS),
          // L'utilisateur peut RÉVEILLER le parent pendant qu'il attend : son
          // message rompt l'attente sans toucher aux filles, qui continuent.
          () => hasPendingRunMessages(run.id),
        );
        if (waited.reports.length > 0 || waited.interrupted || subagents.pending() === 0) {
          return waited;
        }
        // Plus de budget, et une fille travaille encore. On ne la TUE pas : on lui
        // demande de sauver son état, et on SUSPEND le tour. Elle reprendra au chunk
        // suivant, et c'est ce qui lui permet de dépasser les 300 s de la fonction.
        await subagents.suspendAll().catch(() => 0);
        // Celles qui n'ont pas su se sauver (historique trop gros, pas rendu la main
        // à temps) sont coupées : leur rapport partiel part quand même.
        const salvaged = subagents.drainReports();
        if (subagents.suspendedCount() > 0) {
          return { reports: salvaged, interrupted: false, suspend: true };
        }
        return { reports: salvaged, interrupted: false };
      },
      parkedForSubagents: run.checkpoint?.parkedForSubagents === true,
      // « Interrompre la réponse en cours » : la boucle abandonne l'appel LLM en
      // vol et renvoie `interrupted` (round partiel jeté).
      checkInterrupt: () => readInterruptFlag(run.id),
      // Miroir des états du checklist de l'agent vers le plan de l'issue liée.
      // Run carnet : pas d'issue — le cochage du carnet passe par le tool dédié.
      syncPlan: (steps) =>
        run.issue_id ? syncIssuePlanStates(run.issue_id, steps) : Promise.resolve(),
      emit,
      emitLive,
      usageSeqStart,
    });

    // Sous-agents encore en vol (MIN-112) : coupés ICI, avant TOUT le reste — avant
    // `background.stopAll()`, avant le commit, avant la construction du checkpoint.
    // Une fille laissée en vol écrirait dans la sandbox pendant le `git add -A`, et
    // sa promesse mourrait de toute façon avec la fonction Vercel. Leur rapport
    // PARTIEL entre dans `result.messages` (donc dans le checkpoint) : le chunk
    // suivant le livre au parent, qui sait ainsi ce qui a été fait à moitié.
    //
    // Sur le chemin de fin de tour NORMAL il n'y a en général plus rien à couper :
    // `awaitSubagents` a déjà attendu, livré et coupé au besoin. Ce qui atterrit ici
    // ce sont les autres sorties — suspend, interruption, `ask_user`, budget épuisé.
    // Le tour est SUSPENDU (re-queue immédiat) : les filles encore en vol sauvent
    // leur état et repartiront au chunk suivant. Sur tout autre chemin de sortie —
    // fin de tour, interruption, erreur, budget épuisé — le run s'arrête là, donc
    // elles sont COUPÉES et leur rapport partiel est livré une bonne fois.
    //
    // D'où la lecture du drapeau d'interruption ICI (MIN-206), AVANT la décision, et
    // pas seulement après le push WIP : un « Stop » cliqué pendant les quelques
    // secondes de finalisation laissait des filles `suspended` — donc REPRENABLES —
    // dans le checkpoint d'un tour que l'utilisateur croit arrêté. Il écrivait
    // ensuite « fais plutôt X », et le tour suivant relançait la fille de la tâche
    // ABANDONNÉE : elle repartait écrire dans la sandbox et brûler le quota, pendant
    // que le parent, garé sur elle (`parkedForSubagents`), ne lisait pas la nouvelle
    // consigne. Un tour arrêté n'a pas de suite : ses filles sont coupées.
    const stopRequested = result.status === "suspended" && (await readInterruptFlag(run.id));
    if (result.status === "suspended" && !stopRequested) {
      await subagents.suspendAll().catch(() => 0);
    } else {
      await subagents
        .cutAll(stopRequested ? "the turn was stopped" : "the parent chunk ended")
        .catch(() => 0);
    }
    let subagentCost = 0;
    for (const report of subagents.drainReports()) {
      result.messages.push({ role: "user", content: report.text });
      subagentCost += report.costUsd;
      await emit("status", { phase: "subagent_report", id: report.id, partial: true });
    }

    // Ce que les filles ont dépensé sans que personne ne l'ait encore porté (MIN-202) :
    // une SUSPENDUE n'est pas livrable, donc son chunk de dépense n'entrait dans aucun
    // `newCost` et le plafond du run se rechargeait d'autant à chaque continuation.
    // Appelé APRÈS le drain ci-dessus (idempotent : chaque record ne rend que son
    // delta, `drainReports` ayant déjà marqué facturé ce qu'il a livré) mais AVANT
    // `records()`, qui fige des COPIES — les marques posées après n'entreraient pas
    // dans le checkpoint, et le chunk suivant repaierait ce qu'on vient d'imputer.
    const unbilledSubagentCost = subagents.settleUnbilled();
    const subagentRecords = subagents.records();
    const newCost = run.cost_usd + result.costUsd + subagentCost + unbilledSubagentCost;
    // `lastFilesSha` amorcé pour TOUTES les mises au repos (ce checkpoint est réutilisé
    // par les chemins WIP/interruption/erreur/budget) : sur le 1er chunk on fixe la
    // baseline, jamais avancée en cours de tour — seule une fin de tour la fait
    // progresser (plus bas). Un chunk ultérieur ne la réinitialise donc pas.
    //
    // Ce qui vaut pour le RUN, quelle que soit la sortie. L'état de TOUR, lui, est
    // ajouté juste en dessous — et c'est ce qui sépare les deux objets (MIN-210).
    const baseCheckpoint: AgentCheckpoint = {
      messages: result.messages,
      usageSeq: result.usageSeqEnd,
      lastFilesSha: run.checkpoint?.lastFilesSha ?? baselineHead,
      instructions,
      ...(subagentRecords.length > 0 ? { subagents: subagentRecords } : {}),
      // Tour GARÉ : le parent avait fini de parler et attend une fille suspendue.
      // Le chunk suivant attendra donc AVANT de faire parler le modèle.
      ...(result.status === "suspended" && subagents.suspendedCount() > 0
        ? { parkedForSubagents: true }
        : {}),
      // Ancres déjà posées par la session de relecture : le plafond des 5 est par
      // RUN, donc son compteur voyage avec le checkpoint (cf. `pr-tools.ts`).
      ...(prToolCtx ? { prInlineComments: prToolCtx.inline.used } : {}),
    };
    /**
     * Ce que le TOUR emporte au chunk suivant (MIN-210) : les fichiers édités que le
     * type-check n'a pas encore vus, et le verrou qui ouvre l'auto-relecture. Sans
     * eux, un tour éclaté sur plusieurs chunks conclut avec un `Set` vide — pas de
     * `tsc`, pas de diff relu, pas d'event `type_check`, et rien qui le dise.
     *
     * Clés OMISES quand elles ne portent rien : un checkpoint ne grossit pas d'un
     * tableau vide, et l'absence se relit comme « ce tour n'a rien touché ».
     */
    const turnState: Pick<AgentCheckpoint, "editedPaths" | "repoTouched"> = {
      ...(editedPaths.size > 0
        ? { editedPaths: [...editedPaths].slice(-CHECKPOINT_EDITED_PATHS_MAX) }
        : {}),
      ...(repoTouched ? { repoTouched: true } : {}),
    };
    /**
     * Le checkpoint des mises au repos qui NE terminent PAS le tour — suspend et
     * re-queue, interruption, erreur, budget épuisé, garde-fous anti-runaway. Sur
     * chacune, `lastFilesSha` reste à sa baseline : ce que le chunk vient d'éditer
     * n'a été ni type-checké ni relu, et le tour suivant doit s'en charger.
     *
     * La fin de tour NATURELLE, elle, repart de `baseCheckpoint` (plus bas).
     */
    const checkpoint: AgentCheckpoint = { ...baseCheckpoint, ...turnState };
    const nowIso = new Date().toISOString();

    // Champs communs à toute mise au REPOS (fin de tour / interruption / erreur /
    // budget épuisé) : run reprennable à chaud, microVM gardée chaude (le reaper la
    // coupera après ~5 min d'inactivité), budget de tour remis à zéro.
    const restFields = {
      continuations: 0,
      // `attempts` compte les claims d'un tour pour la reprise sur crash
      // (`requeueStuckRuns`), et `claim_agent_run` l'incrémente à CHAQUE claim. Sans
      // remise à zéro ici, il s'accumule sur la vie entière du run — or MIN-68 fait
      // du multi-tours la vie normale d'un run (chaque reprise à chaud = un claim de
      // plus). Passé le budget, un crash ne requeue plus : il marque `failed` ET
      // efface le checkpoint → conversation morte pour de bon. Un tour qui arrive au
      // repos est un tour SAIN : son successeur repart avec son budget entier.
      attempts: 0,
      window_started_at: null,
      cost_usd: newCost,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: nowIso,
      interrupt_requested: false,
      // Chaque entrée au repos REMET l'attente à zéro — seul le tour terminé sur
      // un ask_user (ci-dessous) la lève.
      awaiting_input: false,
    } satisfies Partial<Parameters<typeof stampRun>[1]>;

    // Enregistre le REPOS. Il n'y a plus qu'UN repos (modèle conversationnel) :
    // `completed` — la session attend le prochain message de l'utilisateur dans sa
    // conversation, et ne bloque PLUS le ticket (seuls queued/running l'occupent).
    // Elle reste reprennable à chaud depuis son composer (checkpoint + snapshot).
    // Si un message de steering est arrivé APRÈS la dernière frontière de round
    // (fenêtre de finalisation : commit+push), on RE-QUEUE au lieu de reposer →
    // le drain relance la boucle qui le draine aussitôt.
    // Renvoie `pending` : true = la session repart aussitôt (steering en file) —
    // l'appelant s'en sert pour NE PAS notifier un repos qui n'en est pas un.
    const restStamp = async (
      extra: Partial<Parameters<typeof stampRun>[1]>,
    ): Promise<boolean> => {
      const pending = await hasPendingRunMessages(run.id);
      await stampRun(run.id, {
        status: pending ? "queued" : "completed",
        ...restFields,
        ...(pending ? { not_before: new Date().toISOString() } : {}),
        ...extra,
      });
      return pending;
    };

    // ── Fin de tour NATURELLE : push du travail, PAS de PR automatique ────────
    if (result.status === "completed") {
      const reply = result.reply?.trim() ?? "";
      const freshTarget = writesToRepo
        ? await resolveRepoCloneTarget(run.project_id).catch(() => null)
        : null;
      const authUrl = freshTarget?.authUrl ?? target.authUrl;
      const token = freshTarget?.token ?? target.token;

      // Les jobs de fond meurent AVANT de stager : un serveur de dev ou un watcher
      // encore vivant réécrirait des fichiers pendant le `git add -A`.
      await background.stopAll().catch(() => 0);

      // Pousse ce que le tour a changé — et RIEN si le tour n'a rien changé : la
      // branche n'apparaît sur le dépôt qu'au premier vrai commit (MIN-123). Si la
      // session suit une PR, GitHub la met à jour tout seul — aucune création ici :
      // ouvrir une PR est la décision de l'agent (`create_pr`) ou de l'utilisateur.
      //
      // Une session de RELECTURE ne passe pas par là du tout (`writesToRepo`) :
      // pas de commit, pas de push, pas de branche enregistrée, pas de PR
      // rouverte, pas d'événement `files_changed`. C'est la moitié harnais de
      // « aucune écriture dans le dépôt » — l'autre est le jeu de tools.
      let pushError: string | null = null;
      const pushed = writesToRepo
        ? await commitAndPush(sandbox, {
            authUrl,
            workBranch,
            baseBranch,
            message: commitMessageFromReply(reply, commitRef),
          }).catch((err) => {
            pushError = (err as Error).message;
            console.error("[agent-execute] turn-end push failed:", pushError);
            return null;
          })
        : null;
      // Push raté → SIGNAL VISIBLE (event + error_message), le run reste au repos
      // reprennable. Un rejet non-fast-forward n'est PAS transitoire (quelqu'un a
      // poussé sur la branche de l'agent) : sans signal, chaque tour re-échouerait
      // en silence et l'utilisateur croirait le travail livré alors que la branche
      // distante ne le reçoit plus jamais.
      if (pushError) {
        await emit("error", {
          message: (PUSH_FAILED_STRINGS[commentLocale] ?? PUSH_FAILED_STRINGS.en)(
            cap(pushError, 300),
          ),
        });
      }

      await noteBranchPushed(pushed);
      if (writesToRepo) await reopenIfRejectedWorkPushed(pushed, token);
      // APRÈS la réouverture éventuelle : elle recale `prState` sur la base, donc
      // un push qui ressuscite une PR refusée se raconte sur la bonne PR.
      await notePrCommits(pushed);
      // Le remote a reçu du travail mais la PR a été FUSIONNÉE pendant le tour
      // (`refreshPrStateFromDb` dans le reopen vient de recaler l'état) : les
      // commits sont préservés sur la branche mais n'appartiennent plus à aucune
      // PR — on le dit, sinon l'utilisateur croit le travail en revue.
      if (pushed?.remoteUpdated && prState.state === "merged" && prState.number != null) {
        await emit("error", {
          message: (MERGED_DURING_TURN_STRINGS[commentLocale] ?? MERGED_DURING_TURN_STRINGS.en)(
            prRef(target.provider, prState.number),
            prTerm(target.provider),
          ),
        });
      }

      // Diff par tour (MIN-46) : émet les fichiers que CE tour a changés, calculés par
      // git dans la sandbox entre la baseline du tour et la tête poussée. Best-effort
      // (n'affecte jamais le repos). `filesToSha` avance la baseline du prochain tour —
      // persistée dans le checkpoint pour que le tour suivant diffe depuis ici.
      let filesToSha = filesFromSha;
      if (pushed?.headSha && pushed.headSha !== filesFromSha) {
        const changed = await changedFiles(sandbox, filesFromSha, pushed.headSha).catch(() => null);
        if (changed && changed.files.length > 0) {
          await emit("files_changed", { files: changed.files, truncated: changed.truncated });
        }
        filesToSha = pushed.headSha;
      }

      // `outcome` = la dernière réponse de la session : c'est elle qu'une future
      // session froide recevra comme résumé du travail précédent.
      //
      // `baseCheckpoint` et pas `checkpoint` : le tour est FINI (MIN-210). Son
      // type-check et son auto-relecture ont parlé, et `lastFilesSha` avance
      // jusqu'à la tête poussée. Emporter `repoTouched` ici ferait relire au tour
      // suivant un diff désormais vide, et `editedPaths` relancerait un `tsc` sur
      // des fichiers déjà checkés.
      const pending = await restStamp({
        checkpoint: { ...baseCheckpoint, lastFilesSha: filesToSha },
        outcome: reply ? cap(reply, 4000) : null,
        // Tour terminé sur un ask_user → la session ATTEND la réponse : point
        // jaune sur les surfaces tant que l'utilisateur n'a pas répondu.
        ...(result.askedUser ? { awaiting_input: true } : {}),
        ...(pushError ? { error_message: cap(pushError, 1000) } : {}),
      });
      // Inbox (MIN-82) : repos réel seulement — un re-queue immédiat (steering
      // en file) n'est pas une fin de tour du point de vue de l'utilisateur.
      if (!pending) {
        await notifyAgentRun(run, result.askedUser ? "agent_question" : "agent_done");
      }
      return "completed";
    }

    // ── interrupted / erreur / suspended : push WIP + persiste le checkpoint ──
    // Même règle qu'en fin de tour : rien ne tourne pendant qu'on stage. Et même
    // exception : une session de relecture ne pousse pas plus à mi-tour qu'à la
    // fin — son seul état durable est son checkpoint.
    await background.stopAll().catch(() => 0);
    const wipPushed = writesToRepo
      ? await commitAndPush(sandbox, {
          authUrl: target.authUrl,
          workBranch,
          baseBranch,
          message: `wip(${commitRef}): chunk ${run.continuations + 1}`,
        }).catch((err) => {
          // Un push raté ne doit pas perdre le checkpoint (l'état repo se re-poussera au chunk suivant).
          console.error("[agent-execute] WIP push failed:", (err as Error).message);
          return null;
        })
      : null;
    await noteBranchPushed(wipPushed);
    if (writesToRepo) await reopenIfRejectedWorkPushed(wipPushed, target.token);
    await notePrCommits(wipPushed);

    // Budget d'usage épuisé → REPOS, avec la carte qui dit pourquoi et ce qu'on peut
    // faire. Le travail du chunk vient d'être poussé en WIP et le checkpoint est
    // conservé : rien n'est perdu, la session repart d'ici quand le budget revient
    // (rechargement, plan supérieur, ou clé perso).
    //
    // Volontairement PAS `restStamp` : celui-ci re-queue s'il reste des messages de
    // steering en file, ce qui relancerait aussitôt un chunk sans budget. Le message
    // en attente reste en file et sera drainé à la reprise.
    if (result.status === "budget_exhausted") {
      const quota = await checkAgentQuota(run.created_by ?? "").catch(() => null);
      /**
       * DEUX causes derrière la même frontière, et elles ne se disent pas
       * pareil : le budget du COMPTE est à zéro (il faut attendre, monter de
       * plan ou passer en BYOK), ou c'est le plafond posé sur CE run qui a
       * mordu — le compte, lui, va très bien, et ce qui se règle est le plafond
       * de la routine. Proposer un upgrade dans ce second cas ferait payer plus
       * cher pour un budget dont il reste l'essentiel.
       *
       * On tranche par le plus SERRÉ des deux, à égalité l'account : un plafond
       * qui vaut exactement le restant du compte veut dire que le compte est à
       * zéro lui aussi.
       */
      const cappedByRun =
        runCapRemainingUsd !== undefined &&
        (accountRemainingUsd === undefined || runCapRemainingUsd < accountRemainingUsd);
      await emit("quota_exhausted", {
        spent: quota?.spent ?? null,
        cap: quota?.cap ?? null,
        resetsAt: quota?.resetsAt ?? null,
        planId: quota?.planId ?? null,
        // null = déjà au sommet de l'échelle : il ne reste qu'attendre, ou le BYOK.
        nextPlanId: quota?.nextPlanId ?? null,
        byok: quota?.mode === "byok",
        cause: cappedByRun ? "run_cap" : "account",
        // Le plafond, dans l'unité où il a été RÉGLÉ : un pourcentage du budget
        // mensuel. Recalculé plutôt que relu sur la routine — c'est un affichage,
        // il ne vaut pas une requête de plus.
        capPercent:
          cappedByRun && quota?.cap && run.budget_usd != null
            ? Math.round((Number(run.budget_usd) / quota.cap) * 100)
            : null,
      });
      await stampRun(run.id, { status: "completed", ...restFields, checkpoint });
      await notifyAgentRun(run, "agent_failed");
      return "completed";
    }

    // Erreur LLM fatale → REPOS reprennable. L'event d'erreur a déjà été émis par la
    // boucle ; le checkpoint (dont un éventuel steering injecté ce round) est conservé
    // → l'utilisateur peut renvoyer un message pour reprendre.
    if (result.status === "error") {
      const pending = await restStamp({
        checkpoint,
        error_message: result.errorMessage ? cap(result.errorMessage, 1000) : null,
      });
      if (!pending) await notifyAgentRun(run, "agent_failed");
      return "completed";
    }

    // « Interrompre » → REPOS (round partiel déjà jeté par la boucle).
    if (result.status === "interrupted") {
      await clearInterrupt(run.id);
      await restStamp({ checkpoint });
      return "interrupted";
    }

    // suspended, mais une interruption a été demandée pendant le chunk → REPOS
    // plutôt que re-queue (course : le drapeau est arrivé après le retour de boucle).
    //
    // UNION des deux lectures, et pas la seule réutilisation de `stopRequested` : le
    // drapeau peut être arrivé pendant le push WIP, c'est-à-dire entre les deux — et
    // c'est précisément la fenêtre pour laquelle ce test existe. Le relire ne coûte
    // une requête que si le premier était faux, soit ce que faisait déjà ce chemin.
    if (stopRequested || (await readInterruptFlag(run.id))) {
      await clearInterrupt(run.id);
      await restStamp({ checkpoint });
      return "interrupted";
    }

    // suspended — garde-fous anti-runaway PAR TOUR : au-delà, on REPOSE (avec un
    // event d'erreur) au lieu d'échouer — la session reste reprennable.
    const nextContinuations = run.continuations + 1;
    const wallClock = run.window_started_at
      ? Date.now() - Date.parse(run.window_started_at)
      : Date.now() - callStart;
    const checkpointTooBig = JSON.stringify(checkpoint).length > MAX_CHECKPOINT_BYTES;

    if (
      nextContinuations > AGENT_MAX_CONTINUATIONS ||
      wallClock > MAX_WALL_CLOCK_MS ||
      checkpointTooBig
    ) {
      /**
       * Un CODE, traduit par le fil — pas une phrase écrite ici.
       *
       * Celle d'avant (« Tour trop long (budget épuisé) — envoie un message pour
       * continuer. ») était fausse deux fois : elle parlait de « budget épuisé »
       * alors qu'aucun budget de dépense n'était en cause — ces trois garde-fous
       * comptent des reprises, des minutes et des octets —, et elle sortait en
       * français en dur, tutoyée, dans une app bilingue où tout le reste passe
       * par next-intl.
       *
       * Deux codes plutôt qu'un : un tour qui a duré et un tour devenu trop
       * volumineux ne se corrigent pas pareil.
       */
      await emit("error", {
        code: checkpointTooBig ? "turnTooBig" : "turnTooLong",
        // Repli pour un client qui ne connaîtrait pas le code (et trace lisible
        // dans la table d'events) : en anglais, comme tout ce qui n'est pas de
        // l'UI dans ce fichier.
        message: checkpointTooBig
          ? "This turn grew too large to carry on. Send a message to start a fresh one."
          : "This turn reached its time limit. Send a message to carry on.",
      });
      const pending = await restStamp({ checkpoint });
      if (!pending) await notifyAgentRun(run, "agent_failed");
      return "completed";
    }

    // Continuation du MÊME tour : re-queue immédiat (window_started_at conservé).
    await stampRun(run.id, {
      status: "queued",
      checkpoint,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      continuations: nextContinuations,
      attempts: 0,
      not_before: nowIso,
      cost_usd: newCost,
    });
    return "suspended";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emit("error", { message });
    /**
     * La dépense du run RELUE AU LEDGER (MIN-215), à écrire sur les stamps de
     * repos d'ici. Un chunk qui lève est sorti de sa boucle sans passer par le
     * moindre `newCost` : sa dépense modèle est au ledger, mais `cost_usd` ne l'a
     * jamais vue. Personne ne la retrouvait ensuite — le chunk suivant repart de
     * la colonne, donc le trou est définitif : `recomputeChainSpend` sous-compte
     * la chaîne, `medianCostByIntent` biaise ses estimations, et « Exécutions
     * précédentes » affiche moins que ce qui a été payé.
     *
     * Écrit tel quel plutôt que cumulé : le catch ne sait pas ce que ce chunk-ci
     * a dépensé (il n'a pas de `result`), et la somme du ledger est déjà le total
     * du run. `Math.max` pour la même raison qu'à l'entrée du chunk — le ledger
     * est best-effort, la colonne peut porter une ligne qu'il a ratée, et une
     * dépense affichée ne doit jamais reculer.
     */
    const spentUsd = await spentFromLedger(run.run_id ?? run.id);
    const costFromLedger =
      spentUsd == null ? {} : { cost_usd: Math.max(run.cost_usd, spentUsd) };
    // Erreur d'AMORÇAGE (repo/modèle/clone : sandbox jamais acquise).
    if (!sandbox) {
      // Une CONVERSATION EXISTANTE (checkpoint) ne meurt jamais sur une erreur
      // d'amorçage — souvent transitoire (mint de token GitHub, 502). REPOS avec
      // l'erreur visible : le prochain message retentera l'amorçage, contexte
      // intact. Seule une run VIERGE (rien à préserver) échoue en `failed`.
      if (run.checkpoint?.messages?.length) {
        await stampRun(run.id, {
          status: "completed",
          error_message: cap(message, 1000),
          continuations: 0,
          attempts: 0,
          window_started_at: null,
          last_activity_at: new Date().toISOString(),
          interrupt_requested: false,
          // Rien n'a été dépensé DANS ce chunk (l'amorçage n'appelle pas le
          // modèle), mais un chunk précédent a pu mourir sans stamper : ce repos
          // est l'occasion de recoller la colonne au ledger.
          ...costFromLedger,
        });
        await notifyAgentRun(run, "agent_failed");
        return "completed";
      }
      await stampRun(run.id, {
        status: "failed",
        error_message: cap(message, 1000),
        checkpoint: null,
        continuations: 0,
      });
      await notifyAgentRun(run, "agent_failed");
      return "failed";
    }
    // Erreur EN COURS DE TOUR → la session reste reprennable : REPOS, checkpoint du
    // dernier état sain conservé (non écrasé), microVM gardée. Si un message de
    // steering attend (accepté pendant le tour, jamais drainé), on RE-QUEUE pour ne
    // pas l'orpheliner — borné par `attempts` (incrémenté à chaque claim, jamais
    // remis à zéro sur ce chemin) pour qu'une erreur persistante ne boucle pas
    // claim → erreur → re-queue indéfiniment.
    await clearInterrupt(run.id).catch(() => {});
    const retryForPending =
      run.attempts < MAX_ERROR_REQUEUE_ATTEMPTS &&
      (await hasPendingRunMessages(run.id).catch(() => false));
    await stampRun(run.id, {
      status: retryForPending ? "queued" : "completed",
      ...(retryForPending
        ? { not_before: new Date().toISOString() }
        : // Repos sain : le budget de reprise sur crash repart entier (sinon il
          // s'épuise sur la vie du run et le prochain crash effacerait son
          // checkpoint via requeueStuckRuns).
          { attempts: 0 }),
      error_message: cap(message, 1000),
      continuations: 0,
      window_started_at: null,
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
      ...costFromLedger,
    });
    if (!retryForPending) await notifyAgentRun(run, "agent_failed");
    return "completed";
  } finally {
    // Filet des sous-agents (MIN-112), AVANT celui des jobs de fond : le chemin
    // normal les a déjà coupés, mais pas le chemin d'ERREUR mid-tour ni celui d'une
    // erreur d'amorçage. Une fille laissée en vol continuerait d'appeler un modèle
    // (facturé) et d'écrire dans la sandbox au nom d'un tour terminé. Son rapport
    // est perdu ici — c'est assumé : sur ce chemin il n'y a plus de checkpoint sain
    // où le mettre.
    if (subagentRegistry) await subagentRegistry.cutAll("the chunk failed").catch(() => 0);

    // Filet des jobs de fond (MIN-114) : les chemins de push les ont déjà tués, mais
    // pas le chemin d'ERREUR mid-tour — et un serveur laissé vivant tiendrait la
    // microVM éveillée jusqu'au reaper. Best-effort, jamais bloquant.
    if (backgroundJobs) await backgroundJobs.stopAll().catch(() => 0);

    // Métrage du compute sandbox (MIN-72) : chaque tranche d'exécution où la
    // microVM a été réveillée est facturée en wall-clock — y compris les tours
    // en échec. Bande de seq dédiée pour ne pas croiser celle des appels LLM
    // (continuations × 1000 + rounds).
    if (sandbox) {
      await recordSandboxUsage({
        runId: run.run_id ?? run.id,
        seq: SANDBOX_USAGE_SEQ_BASE + run.continuations,
        billTo: runBillTo,
        // Les minutes de microVM d'une routine se rangent avec elle : sans ça,
        // la moitié compute de sa dépense resterait sous « Agents ».
        feature: sandboxUsageFeature,
        projectId: run.project_id,
        durationMs: Date.now() - callStart,
      }).catch(() => {});
    }
  }
}

/** Base de seq des lignes `sandbox_compute` (hors de la bande des appels LLM). */
const SANDBOX_USAGE_SEQ_BASE = 1_000_000_000;

/** Note de fil quand le push de fin de tour échoue (visible dans la conversation). */
const PUSH_FAILED_STRINGS: Record<Locale, (detail: string) => string> = {
  fr: (detail) =>
    `Le push de fin de tour a échoué — la branche distante n'a PAS reçu le travail de ce tour. Le travail reste dans la sandbox et sera re-poussé au prochain tour. Détail : ${detail}`,
  en: (detail) =>
    `The turn-end push failed — the remote branch did NOT receive this turn's work. The work is kept in the sandbox and will be pushed again next turn. Detail: ${detail}`,
};

/** Terme provider affiché dans les notes/commentaires (marques, non localisées). */
function prTerm(provider: RepoProviderId): string {
  return provider === "gitlab" ? "merge request" : "pull request";
}

/** Référence provider d'une PR/MR : `#12` sur GitHub, `!12` sur GitLab. */
function prRef(provider: RepoProviderId, n: number): string {
  return provider === "gitlab" ? `!${n}` : `#${n}`;
}

function capitalized(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** Note de fil quand la PR a été fusionnée PENDANT le tour (travail hors PR). */
const MERGED_DURING_TURN_STRINGS: Record<Locale, (ref: string, term: string) => string> = {
  fr: (ref, term) =>
    `La ${term} ${ref} a été fusionnée pendant ce tour : le nouveau travail a été poussé sur la branche mais n'appartient plus à aucune ${term}. Lance une nouvelle session pour continuer — elle repartira d'une branche neuve.`,
  en: (ref, term) =>
    `${capitalized(term)} ${ref} was merged during this turn: the new work was pushed to the branch but no longer belongs to any ${term}. Start a new session to continue — it will begin from a fresh branch.`,
};

const COMMENT_STRINGS: Record<
  Locale,
  {
    header: (id: string) => string;
    opened: (term: string) => string;
    reopened: (term: string) => string;
    viewPr: (term: string) => string;
  }
> = {
  fr: {
    header: (id) => `Agent numo — ${id}`,
    opened: (term) => `${capitalized(term)} ouverte.`,
    reopened: (term) => `${capitalized(term)} rouverte avec le nouveau travail.`,
    viewPr: (term) => `Voir la ${term}`,
  },
  en: {
    header: (id) => `Numo agent — ${id}`,
    opened: (term) => `${capitalized(term)} opened.`,
    reopened: (term) => `${capitalized(term)} reopened with the new work.`,
    viewPr: (term) => `View the ${term}`,
  },
};

/**
 * Réglages de compte qui pilotent le run, lus en UN appel (`getAccountSettings`
 * porte déjà les deux) :
 *  - `locale` : langue du résumé de l'agent et du commentaire d'issue. Celle du
 *    lanceur, défaut owner du projet, puis défaut de l'app.
 *  - `numoDefaultStatus` : statut d'atterrissage d'un ticket créé par l'agent
 *    (Compte → Préférences). Il ne vient QUE du lanceur — c'est SON réglage ;
 *    sans lanceur, le défaut historique (`triage`), jamais celui de l'owner.
 */
async function resolveRunPrefs(
  run: AgentRun,
): Promise<{ locale: Locale; numoDefaultStatus: NumoDefaultStatus }> {
  if (run.created_by) {
    const r = await getAccountSettings({ userId: run.created_by });
    if (r.ok) {
      return {
        locale: r.settings.locale,
        numoDefaultStatus: r.settings.numo_default_status,
      };
    }
  }
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", run.project_id)
      .maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      const r = await getAccountSettings({ userId: ownerId });
      if (r.ok) {
        return { locale: r.settings.locale, numoDefaultStatus: DEFAULT_NUMO_STATUS };
      }
    }
  } catch {
    // ignore — on retombe sur le défaut
  }
  return { locale: defaultLocale, numoDefaultStatus: DEFAULT_NUMO_STATUS };
}

/**
 * Poste un commentaire d'issue sur ÉVÉNEMENT PR uniquement (création/réouverture),
 * attribué à Numo. Les tours de conversation ordinaires ne commentent plus le
 * ticket : tout vit dans la conversation de la session.
 */
async function postPrComment(
  run: AgentRun,
  identifier: string,
  kind: "opened" | "reopened",
  prUrl: string,
  locale: Locale,
  provider: RepoProviderId,
): Promise<void> {
  if (!run.created_by || !run.issue_id) return;
  try {
    const service = getServiceClient();
    const s = COMMENT_STRINGS[locale] ?? COMMENT_STRINGS.en;
    const term = prTerm(provider);
    const label = kind === "reopened" ? s.reopened(term) : s.opened(term);
    const body = `**${s.header(identifier)}**\n\n${label}\n\n🔗 [${s.viewPr(term)}](${prUrl})`;
    await service.from("comments").insert({
      issue_id: run.issue_id,
      author_id: run.created_by,
      body,
      via_assistant: true,
    });
  } catch (err) {
    console.error("[agent-execute] PR comment failed:", (err as Error).message);
  }
}
