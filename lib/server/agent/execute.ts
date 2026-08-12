import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { joinedPage } from "@/lib/server/resource-select";
import { recordSandboxUsage } from "@/lib/server/usage";
import {
  recordAiUsage,
  spentFromLedger,
  type AiUsageBillTo,
} from "@/lib/server/ai-usage";
import { AGENT_MAX_CONTINUATIONS } from "@/lib/agent-models";
import {
  CHUNK_FLOOR_MS,
  chunkSoftDeadlineMs,
} from "./chunk-budget";
import { planProviderStall } from "./retry";
import {
  resolveRepoCloneTarget,
  type RepoCloneTarget,
} from "./repo-access";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { getGithubBotCommitIdentity } from "@/lib/server/git/github-app";
import {
  getOrCreateAgentSandbox,
  sandboxHost,
  sandboxName,
  type Sandbox,
} from "./sandbox";
import {
  cloneRepo,
  clonePullRequest,
  commitAndPush,
  revParseHead,
  changedFiles,
  repoBackgroundRunner,
} from "./repo-host";
import { liveEditHook, newLiveEditLog } from "./live-edits";
import { BackgroundJobs } from "./background";
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
  makeSubagentModelResolver,
  scopeSubagentModels,
  subagentRoundsLeft,
  SUBAGENT_MAX_ROUNDS,
  SUBAGENT_PARENT_RESERVE_MS,
  SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS,
} from "./subagent-config";
import {
  getSubagentFavorites,
  maxParallelSubagents,
} from "./subagent-app-config";
import { getAgentModelsForUser } from "./models-catalog";
import { pruneToolOutputs } from "./prune";
import { SecretRedactor } from "./redact";
import {
  fitCheckpoint,
  MAX_CHECKPOINT_BYTES,
} from "./checkpoint-fit";
import { newPlanWriteSink, watchPlanWrites } from "./plan-closure";
import { newVerificationSink } from "./diagnostics";
import { gateCreatePr, gateWritePlan, makeDeliveryGate } from "./delivery-gate";
import { toolOutputFileName } from "./command-output";
import { usesApplyPatch } from "./patch";
import {
  REPO_INSTRUCTION_FILES,
  type InstructionsState,
} from "./repo-instructions";
import {
  runAgentLoop,
  BUDGET_REFRESH_INTERVAL_MS,
  type AgentChatMessage,
  type EmitAgentEvent,
  type EmitAgentLive,
} from "./agent-loop";
// Les 25 tools et leur routage vivent à part depuis MIN-224 : ce module-là
// descend dans la microVM avec la boucle, celui-ci non.
import {
  makeExecTool,
  readRepoInstructions,
  type CreatePrHandler,
  type WebSearchHandler,
} from "./exec-tool";
import { broadcastRunStream } from "./live";
import {
  agentToolsFor,
  subagentToolsFor,
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
import { buildOpencodeAnchor } from "./opencode-anchor";
import type { AgentEngine } from "@/lib/agent-engines";
import {
  loadPrReviewBoot,
  loadPrRunContext,
  pullRequestHeadRef,
  pullRequestLocalBranch,
} from "./pr-run";
import {
  executePrTool,
  type PrToolContext,
  type ReviewableFile,
} from "./pr-tools";
import {
  executeProjectPrTool,
  type ProjectPrToolContext,
} from "./project-pr-tools";
import {
  resolveAgentApiKey,
  getModelContextWindow,
  getModelInputPrice,
  getModelPricing,
  supportsImageInput,
} from "./model";
import {
  agentSandboxName,
  buildAgentNetworkPolicy,
  AGENT_LLM_PLACEHOLDER_KEY,
} from "./network-policy";
import { startVmLoop } from "./vm-launch";
import {
  VM_MAX_CHECKPOINT_BYTES,
  type VmJob,
} from "./vm/protocol";
import {
  mintRunKey,
  revokeRunKey,
  runKeyCapUsd,
} from "./run-key";
import { agentControlOrigin } from "./origin";
import {
  forgeFor,
  type Forge,
} from "./forge";
import { prStateFromRef } from "./pull-requests";
import type { PullRequestRef } from "./pr";
import { syncIssuePlanStates } from "./plan-sync";
import {
  executeIssueTool,
  type IssueToolContext,
} from "./issue-tools";
import {
  executeScratchpadTool,
  type ScratchpadToolContext,
} from "./scratchpad-tools";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  notePrCommits as notePrCommitsOn,
  registerPr as registerPrOn,
  reopenIfRejectedWorkPushed as reopenIfRejectedWorkPushedOn,
  openPullRequestAfterPush,
  resolveRunPrefs,
  prRef,
  prTerm,
  MERGED_DURING_TURN_STRINGS,
  PUSH_FAILED_STRINGS,
  SANDBOX_USAGE_SEQ_BASE,
  type PrLandingContext,
} from "./pr-landing";
import {
  stampRun,
  appendEvent,
  pullPendingMessages,
  previousRunSummaryForIssue,
  previousRunSummaryForPr,
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
/**
 * Chemins édités qu'un tour emporte au chunk suivant (MIN-210) — les PLUS RÉCENTS
 * au-delà. Le cap tient `MAX_CHECKPOINT_BYTES` à l'abri d'une refonte à mille
 * fichiers, et il coûte peu : `formatTypeErrors` ne fait que remonter les chemins
 * touchés en tête du bloc, il ne filtre rien — un chemin tombé sous le cap voit
 * quand même ses erreurs servies, plus bas.
 */
const CHECKPOINT_EDITED_PATHS_MAX = 200;

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

/**
 * Ce qu'un appel d'exécuteur a fait du run.
 *
 * `detached` (MIN-224) est le cinquième, et il ne ressemble à aucun des autres :
 * le tour n'est ni fini ni suspendu, il TOURNE — dans la microVM, hors de cette
 * invocation. Le run reste `running` et personne ne l'attend. C'est le drain qui
 * lit cette valeur, et ce qu'elle lui dit est « passe au suivant ».
 */
export type ExecuteOutcome =
  | "completed"
  | "suspended"
  | "interrupted"
  | "failed"
  | "detached";

function cap(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}… [truncated]`;
}

function slugForBranch(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}



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
 *
 * Ce budget-ci est par FILLE, et rien ne borne leur nombre à l'échelle du
 * checkpoint : six filles suspendues franchissent le plafond à elles seules. C'est
 * le premier palier de `fitCheckpoint` (MIN-217) qui rattrape ce cas — il lâche
 * ces historiques-là avant tout le reste, précisément parce qu'ils sont invisibles
 * à l'élagage et à la compaction, qui ne regardent que `messages`.
 */
const SUBAGENT_HISTORY_MAX_BYTES = 1_500_000;

/**
 * Prépare l'historique d'une fille pour le checkpoint, ou `null` s'il ne rentre
 * pas. On élague d'abord les sorties de tools périmées — le même traitement que la
 * boucle applique à son propre historique, et de loin le plus gros poste. Ce qui
 * reste au-dessus du budget n'est pas tronqué au hasard : un historique coupé au
 * milieu casse l'appariement tool_call ↔ tool_result et le round-trip échouerait
 * au provider. Mieux vaut renoncer à la reprise et livrer un rapport partiel.
 *
 * Les seuils sont ÉCRITS ICI, serrés, et pas ceux de la boucle : ce budget-ci se
 * compte en OCTETS de checkpoint, pas en fenêtre de modèle. Les défauts de
 * `prune.ts` ont été desserrés d'un ordre de grandeur (MIN-248) parce qu'ils
 * gouvernaient la mémoire du modèle ; les appliquer ici ferait renoncer à des
 * reprises qu'un élagage un peu plus franc sauve.
 */
function capSubagentHistory(messages: AgentChatMessage[]): AgentChatMessage[] | null {
  if (!messages.length) return null;
  const trimmed = [...messages];
  pruneToolOutputs(trimmed, { protectBytes: 40_000, minimumBytes: 20_000 });
  return JSON.stringify(trimmed).length <= SUBAGENT_HISTORY_MAX_BYTES ? trimmed : null;
}

/**
 * QUEL MOTEUR DOIT JOUER CE TOUR (MIN-286) — la ligne du run, sauf si son
 * CHECKPOINT dit le contraire.
 *
 * La ligne suffirait si elle était toujours vraie, et elle ne l'est pas dans une
 * fenêtre précise : entre la migration qui a posé `agent_engine` (défaut
 * `opencode`) et le déploiement de ce code, la prod tournait encore sur la boucle
 * maison, qui n'écrit pas cette colonne — les runs de cette fenêtre portent donc
 * `opencode` sur leur ligne et une conversation de boucle dans leur checkpoint.
 * Repris tels quels, ils partiraient chez opencode avec un journal d'événements
 * vide : la conversation entière perdue, en silence, sur un run que l'utilisateur
 * croit poursuivre.
 *
 * Le checkpoint, lui, ne peut pas mentir : c'est le moteur qui l'a écrit. Une
 * conversation dans `messages` sans journal `opencode` a été jouée par la boucle,
 * et elle FINIT avec elle. Un run neuf n'a pas de checkpoint du tout et suit sa
 * ligne, donc opencode.
 *
 * Ce garde-fou coûte trois lignes et couvre plus que sa fenêtre : n'importe quelle
 * ligne mal étiquetée (rattrapage de données, SQL à la main) retombe sur le moteur
 * qui détient réellement l'historique.
 */
function effectiveEngine(run: AgentRun): AgentEngine {
  // PAS de liaison nommée `checkpoint` ici : `checkpoint-turn-state.test.ts` ancre
  // ses lectures sur la PREMIÈRE déclaration de ce nom dans le fichier, qui est le
  // checkpoint de fin de tour. L'ombrer lui ferait vérifier le mauvais objet — et
  // il l'a dit tout de suite, ce qui est exactement ce qu'on lui demande.
  const saved = run.checkpoint;
  if (saved?.messages?.length && !saved.opencode) return "loop";
  return run.agent_engine;
}

/**
 * LE PROMPT D'UN TOUR OPENCODE, tiré de l'amorce (MIN-286).
 *
 * L'amorce d'un tour froid est CONVERSATIONNELLE : un prompt système, puis des
 * messages utilisateur — contexte du ticket ou de la pull request, travail hérité
 * d'une PR, instructions du dépôt, et en dernier la demande du lanceur. Opencode
 * n'accepte qu'un message : on lui rend donc ces morceaux-là, dans l'ordre, séparés
 * comme des blocs.
 *
 * Le message SYSTÈME est délibérément laissé de côté : son vis-à-vis chez opencode
 * est l'ancrage servi en `instructions` (cf. `buildOpencodeAnchor`), et l'envoyer
 * ici en plus le dirait deux fois, une fois dans le système et une fois dans la
 * bouche de l'utilisateur.
 */
function userPromptFromMessages(messages: AgentChatMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : // Une amorce n'a que du texte (les images arrivent par les tools) ; le
          // repli existe pour ne jamais rendre « [object Object] » à un modèle.
          (m.content ?? [])
            .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
            .join(""),
    )
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");
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
      .select(
        "id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(title)",
      )
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
      page_id: string | null;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      page: unknown;
    }>).map((a) =>
      a.kind === "link"
        ? {
            id: a.id,
            kind: "link" as const,
            name: a.file_name ?? "link",
            url: a.url,
          }
        : a.kind === "page"
        ? {
            id: a.id,
            kind: "page" as const,
            // Le titre VIVANT : l'amorce est un instantané, autant qu'il soit
            // pris au moment du run et pas à celui de l'ajout.
            name: joinedPage(a.page)?.title?.trim() || a.file_name || "page",
            pageId: a.page_id,
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
    /** Forge du dépôt — un numéro de PR n'est unique QUE par forge (cf. MIN-69). */
    provider: RepoProviderId;
    repo: AgentRepoContext;
  },
): Promise<string | null> {
  // Un run CARNET n'hérite de rien PAR DÉFAUT (pas de lignée). L'exception est
  // celui qui REPREND une pull request (MIN-292) : sa lignée est la PR, et la
  // suite de cette fonction sait déjà la raconter à partir de `pr_number` — c'est
  // seulement le résumé de la session précédente qui se lit ailleurs (par PR, pas
  // par ticket). Sans PR héritée, rien à dire : la branche d'un run carnet neuf
  // n'a pas de passé.
  if (!run.issue_id && run.pr_number == null) return null;
  const issueId = run.issue_id;
  if (run.pr_number == null) {
    if (!issueId) return null;
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
    // Le fil de la lignée : par ticket quand il y en a un, par pull request
    // sinon (une PR de carnet reprise — MIN-292).
    (issueId
      ? previousRunSummaryForIssue(issueId, run.id)
      : previousRunSummaryForPr(
          {
            repoFullName: opts.repoFullName,
            prNumber: number,
            provider: opts.provider,
          },
          run.id,
        )
    ).catch(() => null),
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
  /**
   * Fichiers touchés par le CHUNK, dits au fil avant le commit qui les arrête —
   * le même registre que celui de la microVM ([live-edits.ts](live-edits.ts)),
   * qui porte les règles (une entrée par chemin, la liste sur chaque charge).
   */
  const liveEdits = newLiveEditLog();
  // Direct du fil : le texte du round pendant qu'il s'écrit, diffusé sur le topic
  // du run. Rien en base — le fil ouvert l'affiche, les autres n'en savent rien.
  const emitLive: EmitAgentLive = (progress) =>
    broadcastRunStream(run.id, {
      ...progress,
      ...liveEdits.payload(),
      at: Date.now(),
    });
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
  /**
   * Les secrets de ce chunk (MIN-239) — le token de forge, sous toutes les formes
   * qu'il aura prises. Déclaré AVANT le `try` parce que le `catch` en a besoin : un
   * `git clone` qui échoue recopie l'URL de clone ENTIÈRE dans son stderr, et ce
   * message-là finit en `agent_runs.error_message`, affiché dans l'UI.
   *
   * Nourri à chaque résolution de cible : le token est re-minté avant chaque push
   * (un tour dure des heures, un token d'installation une heure), et un `.git/config`
   * lu au round 3 porte celui du clone, pas celui du dernier push. Le registre les
   * garde tous.
   */
  const secrets = new SecretRedactor();
  // Jobs de fond du chunk (MIN-114), visibles du `finally` : quel que soit le
  // chemin de sortie (fin de tour, erreur, interruption), rien ne survit au chunk.
  let backgroundJobs: BackgroundJobs | null = null;
  // Sous-agents du chunk (MIN-112), visibles du `finally` : une fille laissée en vol
  // continuerait d'appeler un modèle et d'écrire dans la sandbox après le retour de
  // la fonction — au nom d'un tour qui n'existe plus.
  let subagentRegistry: Subagents | null = null;
  /**
   * La boucle a-t-elle VRAIMENT été lancée dans la microVM (MIN-224) ? C'est ce
   * qui décide qui facture le compute de ce passage, et il n'y a pas de troisième
   * réponse : soit la boucle tourne et c'est elle qui rendra la note (amorçage
   * compris), soit elle n'a jamais démarré et la fonction est la seule à savoir
   * qu'une microVM a été réveillée pour rien. Voir le `finally`.
   */
  let vmLoopLaunched = false;

  /**
   * LE MÉTRAGE COMPUTE DU CHUNK, appelable AVANT la mise au repos (MIN-224).
   *
   * Il vivait dans le seul `finally`, donc APRÈS les stamps — et c'est ce qui
   * faisait diverger le sens d'`agent_runs.cost_usd` entre les deux moteurs. La
   * nouvelle forme facture le compute puis relit le ledger ([vm-rest.ts](vm-rest.ts)),
   * si bien que sa colonne vaut la somme du ledger, compute compris ; ici la
   * colonne ne portait que le modèle, ET en perdait — un chunk mort sans stamper
   * n'a jamais porté sa part.
   *
   * IDEMPOTENT, et il faut qu'il le soit : le `finally` reste le filet de tout ce
   * qui ne passe pas par un repos (un throw, un amorçage raté). Deux écritures
   * partageraient la bande de seq (`SANDBOX_USAGE_SEQ_BASE + continuations`) et se
   * marcheraient dessus.
   *
   * `Date.now() - callStart` À L'APPEL : facturé depuis le repos plutôt que depuis
   * le `finally`, il perd les quelques centaines de millisecondes du stamp — un
   * minorant, dans le bon sens de l'erreur.
   */
  let sandboxComputeBilled = false;
  const billSandboxCompute = async (): Promise<void> => {
    if (sandboxComputeBilled || !sandbox || vmLoopLaunched) return;
    sandboxComputeBilled = true;
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
  };

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
    if (
      !run.loop_in_vm &&
      !run.interrupt_requested &&
      (run.checkpoint?.subagents ?? []).some(isResumableSubagent)
    ) {
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
    secrets.addAuthUrl(target.authUrl);
    secrets.add(target.token);
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

    /**
     * Budget d'usage RESTANT à l'entrée du chunk. Snapshoté une fois ici : la
     * boucle compare son coût accumulé à ce restant, sans relire l'usage à chaque
     * round. En BYOK, `unlimited` → aucun plafond (l'utilisateur paie sa note).
     *
     * Deux lectures, une seule attente : la somme du ledger (cf. `runSpentUsd`)
     * ne dépend pas du quota, elle part avec lui.
     *
     * LU AVANT LA MICROVM depuis MIN-223, et pas seulement pour la boucle : c'est
     * ce restant qui donne son plafond à la clé LLM du run, et cette clé doit
     * exister avant la politique réseau, donc avant la VM. Une seule lecture pour
     * les deux usages — la stale de quelques secondes que ça introduit côté boucle
     * est sans effet (le plafond a 1,5× de marge, et le ledger est relu à chaque
     * chunk).
     */
    const [quotaNow, ledgerSpentUsd] = await Promise.all([
      checkAgentQuota(run.created_by ?? "").catch(() => null),
      spentFromLedger(run.run_id ?? run.id),
    ]);

    // Endpoint du run (BYOK de l'utilisateur, ou clé plateforme OpenRouter).
    // Résolu AVANT l'amorce de l'historique : le prompt système ne décrit que les
    // tools réellement offerts, et web_search en dépend. Et avant la microVM
    // depuis MIN-223 : c'est cette clé (ou celle du run, ci-dessous) que le
    // firewall injectera — la politique réseau ne peut pas se construire sans.
    const { apiKey, baseUrl, provider, mode: keyMode } = await resolveAgentApiKey(run.created_by);

    /**
     * LA CLÉ QUE LE FIREWALL INJECTERA, et elle n'est pas forcément `apiKey`.
     *
     * En mode plateforme, on émet une clé POUR CE RUN, à plafond dur tenu par
     * OpenRouter (`run-key.ts`) : la politique réseau empêche la VM de LIRE la
     * clé, pas de l'UTILISER hors de la boucle — un `curl` sur la route créditée
     * dépense sans passer par le ledger. Le plafond fournisseur est ce qui borne
     * cette dépense-là, et il vit hors de la VM comme hors de notre code.
     *
     * En BYOK, aucun mint : c'est la clé de l'utilisateur, sur son compte à lui,
     * et l'API de provisioning n'émet que sur le compte qui la détient. Elle est
     * aussi inexfiltrable que la nôtre, mais non plafonnable — c'est dit dans
     * l'écran BYOK, pas corrigé ici.
     *
     * Le mint échoue en silence (variable non posée, API en panne) → on retombe
     * sur `apiKey`. Un garde-fou de dépense qui manque ne doit pas empêcher un
     * run de tourner ; il doit se voir dans les logs.
     */
    let vmKeyHash: string | null = null;
    let vmKey = apiKey;
    if (keyMode === "platform") {
      const minted = await mintRunKey({
        runId: run.id,
        capUsd: runKeyCapUsd({
          runBudgetUsd: run.budget_usd,
          runSpentUsd: Math.max(run.cost_usd, ledgerSpentUsd ?? 0),
          accountRemainingUsd:
            quotaNow && !quotaNow.unlimited ? Math.max(0, quotaNow.remaining ?? 0) : undefined,
        }),
      });
      if (minted) {
        vmKey = minted.key;
        vmKeyHash = minted.hash;
      }
    }

    // Sandbox : réveille la microVM (filesystem restauré depuis le snapshot
    // persistant → reprise rapide) ; sinon `onCreate` clone la branche de travail.
    // Nom déterministe → même microVM/snapshot d'un tour à l'autre.
    const { sandbox: sb } = await getOrCreateAgentSandbox({
      name: agentSandboxName(run.id),
      // MIN-223 : la microVM ne détient aucun secret. Reposée à chaque réveil —
      // la politique survit à la reprise, mais avec la clé d'HIER dedans, et
      // celle-là est révoquée à la mise au repos.
      networkPolicy: buildAgentNetworkPolicy({
        baseUrl,
        llmKey: vmKey,
        appOrigin: agentControlOrigin(),
      }),
      onCreate: async (fresh) => {
        if (prRun) {
          // Par la REF SERVEUR de la PR, pas par le nom de branche : sur un fork,
          // la branche de tête n'existe pas dans le dépôt de base (cf.
          // `clonePullRequest`). Aucune identité de committer à résoudre — rien
          // ne sera commité.
          //
          // La base du diff est demandée à la FORGE (MIN-258), pas déduite du
          // clone : `origin/<base>` est un tip vivant, et differ contre lui
          // ferait passer pour une suppression de la PR tout commit fusionné dans
          // la base depuis son ouverture. Best-effort des deux côtés — un merge
          // base illisible dégrade la relecture, il ne l'annule pas. La tête est
          // donnée par son SHA : sur un fork, son nom de branche n'existe pas ici.
          const baseSha = await forge
            .getMergeBaseSha({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prRun.number,
              base: baseBranch,
              head: prRun.headSha ?? prRun.headBranch ?? "",
            })
            .catch((err: unknown) => {
              console.error(`[agent] merge base unreadable for PR #${prRun.number}:`, err);
              return null;
            });
          await clonePullRequest(sandboxHost(fresh), {
            authUrl: target.authUrl,
            baseBranch,
            headRef: pullRequestHeadRef(prRun.provider, prRun.number),
            headBranch: prRun.headBranch,
            localBranch: workBranch,
            baseSha,
          });
          return;
        }
        const committer = await resolveCommitterIdentity(target);
        await cloneRepo(sandboxHost(fresh), {
          authUrl: target.authUrl,
          baseBranch,
          workBranch,
          committer,
        });
      },
    });
    sandbox = sb;
    /**
     * Les mains sur le dépôt, par RPC (MIN-224). Dans l'ancienne forme c'est le
     * seul chemin ; dans la nouvelle, la fonction n'en garde que l'amorçage (une
     * lecture d'`AGENTS.md`, l'écriture du bundle) et c'est la boucle, dans la
     * microVM, qui reprend les mêmes gestes sur le disque local.
     */
    const host = sandboxHost(sb);

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
      // MIN-223 : de quoi révoquer la clé du run quand la VM sera mise au repos.
      // Écrit MÊME quand le mint a échoué (null) — sinon on garderait le hash
      // d'une clé qui n'est plus celle que le firewall injecte, et le reaper
      // révoquerait dans le vide en croyant avoir fermé le robinet.
      provider_key_id: vmKeyHash,
    });

    // La clé du chunk PRÉCÉDENT n'a plus personne pour l'utiliser : la politique
    // qu'on vient de poser injecte la nouvelle. Révoquée tout de suite plutôt
    // qu'attendue à son expiration — c'est un appel, une fois par chunk, sur un
    // chunk qui dure des minutes, et l'oublier laisserait traîner autant de clés
    // vivantes que de reprises.
    if (run.provider_key_id && run.provider_key_id !== vmKeyHash) {
      await revokeRunKey(run.provider_key_id);
    }

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
    // Sans objet pour un run `loop_in_vm` (MIN-224) : ce qui reste à la FONCTION
    // n'a plus à couvrir un tour, seulement trois écritures et un lancement. Un
    // amorçage qui déborde n'y met rien en danger.
    if (!run.loop_in_vm && afterSetupMs < CHUNK_FLOOR_MS) {
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
    const baselineHead = await revParseHead(host);
    const filesFromSha = run.checkpoint?.lastFilesSha ?? baselineHead;

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
    /**
     * LES PRIX DES MODÈLES DE FILLE (MIN-286) — même index, même cache et même
     * raison que `modelPricing` ci-dessous : le harness opencode déclare un
     * modèle par favori offert, et un modèle sans prix y rend `cost: 0`. Une
     * fille dont on ne connaît pas le prix n'est pas offerte du tout
     * (`subagentModelChoices`), plutôt qu'offerte gratuite au ledger.
     */
    const subagentPricing = Object.fromEntries(
      (
        await Promise.all(
          subagentFavorites.map(
            async (f) =>
              [f.id, await getModelPricing(f.id, provider, apiKey).catch(() => null)] as const,
          ),
        )
      ).flatMap(([id, pricing]) => (pricing ? [[id, pricing] as const] : [])),
    );

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
    } else if (run.checkpoint?.opencode?.events?.length) {
      /**
       * UN TOUR REPRIS SOUS OPENCODE N'A PAS D'AMORCE À REFAIRE (MIN-286).
       *
       * Sa mémoire est le journal d'événements, que le superviseur rejoue : le
       * contexte du ticket, les instructions du dépôt et la demande du lanceur y
       * sont déjà, dits une fois au premier tour. Rejouer l'amorce ici les
       * reposterait PAR-DESSUS l'historique restauré — l'agent relirait la
       * consigne initiale comme si elle venait d'arriver, et repartirait faire ce
       * qu'il vient de faire. C'est ce que `VmJob.opencodeInput` promet en toutes
       * lettres (« `prompt` est vide sur un tour REPRIS : la demande y arrive par
       * le steering »), et l'amorce coûterait en plus six appels de forge.
       *
       * Le pendant de la branche du dessus, pour l'autre moteur : là-bas la
       * conversation EST `checkpoint.messages`, ici elle n'y est jamais.
       */
      messages = [];
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
        webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
        // Une étape de CHAÎNE (MIN-147) : c'est le seul run qui sert
        // `report_verdict`, donc le seul dont le prompt en parle (MIN-245).
        chain: !!run.chain_id,
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
            provider: target.provider,
            repo: { fullName: target.repoFullName, defaultBranch: baseBranch, workBranch },
          })
        : null;
      if (inheritedPr) messages.push({ role: "user", content: inheritedPr });
      // Instructions du dépôt (AGENTS.md / CLAUDE.md) — message dédié après le contexte.
      // La racine est TOUJOURS marquée vue, trouvée ou non : ce qui suit ne recharge
      // que les sous-dossiers, à la première édition dedans (MIN-115).
      const repoInstructions = await readRepoInstructions(host);
      instructions.paths.push(...REPO_INSTRUCTION_FILES);
      if (repoInstructions) {
        messages.push({ role: "user", content: repoInstructions.message });
        instructions.bytes += repoInstructions.bytes;
      }
      // La demande du lanceur, en dernier : c'est À ELLE que l'agent répond.
      // Run CARNET : la demande part emballée dans la MÊME structure que « copier
      // le prompt » du carnet (balises <notes>, sémantique des cases, « ce sont
      // des notes personnelles, pas une spec — demande avant de deviner »), SANS
      // le bloc MCP : ses tools natifs (read_scratchpad…) le remplacent.
      //
      // Lancé DEPUIS le carnet, le prompt arrive déjà emballé (le composer le
      // montre en clair, cf. use-launch-agent-note.ts) et `buildScratchpadPrompt`
      // le laisse passer tel quel. L'emballage ici sert donc les runs carnet
      // partis d'ailleurs — une consigne libre tapée dans le composer, une
      // routine — qui, eux, n'ont que du texte nu.
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

    /**
     * CE QUE LE MOTEUR OPENCODE REÇOIT DU TOUR (MIN-286) : son ancrage minddy et
     * le message à poster. Composé ICI, dans la fonction, comme tout le reste de
     * l'amorçage — la microVM n'a ni le ticket, ni les favoris, ni la locale.
     *
     * L'ancrage se reconstruit à chaque tour (cf. `VmJob.opencodeInput`) et prend
     * les MÊMES arguments que le prompt système de la boucle maison : c'est ce qui
     * garantit qu'un run basculé se comporte pareil, et c'est le critère de la
     * semaine de bascule.
     *
     * Le prompt, lui, est ce que l'amorce a mis dans les messages UTILISATEUR :
     * contexte du ticket (ou de la pull request), travail hérité, instructions du
     * dépôt, demande du lanceur. Sur un tour repris, l'amorce n'a rien écrit —
     * l'historique vit dans le journal d'opencode — et le prompt vient du steering.
     */
    const opencodeInput =
      effectiveEngine(run) === "opencode"
        ? {
            anchorInstructions: buildOpencodeAnchor({
              locale: commentLocale,
              anchor,
              interactive: !run.routine_id,
              webSearch: webSearchAllowed,
              webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
              chain: !!run.chain_id,
              images: imageInput,
              // Même règle que le prompt système : une relecture ne délègue pas,
              // et un tour sans place de fille ne doit pas lire une section qui
              // décrit un tool que la config ne sert pas.
              ...(writesToRepo && subagentMaxParallel > 0
                ? {
                    subagents: {
                      favorites: subagentFavorites,
                      models: subagentModels,
                      maxMultiplier: subagentScope.maxMultiplier,
                    },
                  }
                : {}),
            }),
            prompt: userPromptFromMessages(messages),
          }
        : undefined;

    // État PR de la session, MUTÉ pendant le tour (create_pr, réouverture au push) :
    // la fin de tour lit l'état à jour, pas celui figé au claim.
    const prState: { number: number | null; url: string | null; state: AgentRun["pr_state"] } = {
      number: run.pr_number,
      url: run.pr_url,
      state: run.pr_state,
    };

    /**
     * L'atterrissage du tour sur la pull request et le ticket — ouvrir, rouvrir,
     * enregistrer, commenter, tracer. Une IMPLÉMENTATION unique
     * ([pr-landing.ts](pr-landing.ts)) depuis MIN-224 : la nouvelle forme, où la
     * boucle vit dans la microVM, fait atterrir ses tours par le plan de contrôle
     * et doit raconter exactement la même chose. Deux copies auraient divergé au
     * premier correctif porté d'un seul côté.
     */
    const landing: PrLandingContext = {
      run,
      target,
      forge,
      issue: issue ? { identifier: issue.identifier } : null,
      workBranch,
      baseBranch,
      locale: commentLocale,
      emit,
      prState,
    };
    const notePrCommits = (pushed: { remoteUpdated: boolean } | null) =>
      notePrCommitsOn(landing, pushed);
    const registerPr = (pr: PullRequestRef, kind: "opened" | "reopened") =>
      registerPrOn(landing, pr, kind);

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
      secrets.addAuthUrl(fresh.authUrl);
      secrets.add(fresh.token);
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
        pushed = await commitAndPush(host, {
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
      // La moitié FORGE, partagée avec la nouvelle forme (MIN-224) : c'est là que
      // vivent les quatre cas — rien à ouvrir, PR mergée, PR déjà vivante, PR
      // refusée à rouvrir — et ils ne doivent pas exister en double.
      return await openPullRequestAfterPush(landing, {
        pushed,
        prTitle,
        body,
        fresh,
        jobsNote,
        noteBranchPushed,
      });
    };

    /** Même implémentation partagée : la réouverture d'une PR refusée au push. */
    const reopenIfRejectedWorkPushed = (
      pushed: { remoteUpdated: boolean } | null,
      token: string,
    ) => reopenIfRejectedWorkPushedOn(landing, pushed, token);

    // Fenêtre de contexte ET prix d'entrée du modèle (OpenRouter) : le seuil de
    // compaction se dérive des deux — la fenêtre le BORNE, le prix le DIMENSIONNE.
    // Une seule lecture d'index sert les deux (cache de process).
    // `modelPricing` sort du MÊME index (donc du même aller-retour caché) : il
    // descend dans la microVM pour que le harness opencode facture à nos prix
    // plutôt qu'à ceux d'un catalogue tiers (MIN-286, cf. `VmModelPricing`).
    const [contextWindow, inputUsdPerMTok, modelPricing] = await Promise.all([
      getModelContextWindow(run.model, provider, apiKey).catch(() => null),
      getModelInputPrice(run.model, provider, apiKey).catch(() => null),
      getModelPricing(run.model, provider, apiKey).catch(() => null),
    ]);

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
    /**
     * Ancres posées par CE RUN, semées depuis le checkpoint. UN SEUL objet pour
     * les deux familles de tools PR (MIN-267) : le plafond des 5 se compte par
     * run, et une session qui relit une pull request et une routine qui en
     * commente cinq ne doivent pas avoir chacune son compteur — sinon « 5 par
     * run » devient « 5 par famille », ce que rien ne justifie.
     */
    const prInline = { used: run.checkpoint?.prInlineComments ?? 0 };
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
              secrets.addAuthUrl(fresh.authUrl);
              secrets.add(fresh.token);
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
          inline: prInline,
        }
      : null;

    /**
     * Les pull requests DU PROJET (MIN-267), câblées comme les précédentes : la
     * forge du provider et un token re-résolu À CHAQUE APPEL — un tour de microVM
     * dure des heures, le token d'installation non.
     *
     * `null` sur une RELECTURE : elle a `prToolCtx` sur la pull request qu'elle
     * relit, et sa lecture seule est une propriété du jeu de tools. Deux verrous,
     * comme pour `create_pr` : le tool n'est pas dans son jeu, et le handler ne
     * lui est pas câblé.
     */
    const projectPrToolCtx: ProjectPrToolContext | null = prRun
      ? null
      : {
          projectId: run.project_id,
          repo: async () => {
            const fresh = await resolveRepoCloneTarget(run.project_id).catch(() => null);
            if (!fresh) return null;
            secrets.addAuthUrl(fresh.authUrl);
            secrets.add(fresh.token);
            return {
              token: fresh.token,
              repoFullName: fresh.repoFullName,
              provider: fresh.provider,
            };
          },
          model: run.model,
          locale: commentLocale,
          inline: prInline,
        };

    // Jobs de fond du chunk (MIN-114). Ils meurent AVANT chaque push (un watcher
    // qui écrit pendant le `git add -A` commiterait n'importe quoi) et de toute
    // façon en fin de chunk (`finally`) : un processus oublié mangerait la microVM
    // jusqu'au reaper, et serait encore là au tour suivant sans que le modèle le
    // sache. Le registre ne survit pas au chunk — c'est assumé, et le tool le dit.
    const background = new BackgroundJobs(
      repoBackgroundRunner(host),
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
    /** Ce que le modèle a vérifié lui-même sur ce chunk (MIN-262) — rempli par
     *  `run_command`, périmé par toute édition, lu par la porte de livraison.
     *  PARTAGÉ avec les filles, comme `editedPaths`. Il ne voyage PAS dans le
     *  checkpoint : un chunk qui reprend n'a rien vu passer vert lui-même. */
    const verification = newVerificationSink();

    // `quotaNow` et `ledgerSpentUsd` sont lus plus haut, avant la microVM (MIN-223) :
    // le plafond de la clé LLM du run en dépend, et cette clé précède la politique
    // réseau, donc la VM.
    //
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
     * LE MÊME CALCUL, RELU EN COURS DE CHUNK (MIN-224).
     *
     * `budgetUsd` ci-dessus est un snapshot, et rien ne réserve de budget : deux
     * runs lancés à la même seconde lisent le même restant et le prennent chacun
     * pour plafond, donc ils peuvent dépenser le double. Ce chunk relit déjà à son
     * entrée — au pire toutes les cinq minutes ; ce crochet resserre à une.
     *
     * Throttlé ici plutôt que dans la boucle : la lecture coûte deux requêtes
     * (facturation + somme du ledger) et un round peut durer trois secondes.
     * `null` = pas encore l'heure, ou lecture en panne — la boucle garde alors son
     * plafond, une facturation injoignable n'arrête pas un run.
     */
    let lastBudgetAt = Date.now();
    const maybeRefreshBudget = async (): Promise<number | null> => {
      if (Date.now() - lastBudgetAt < BUDGET_REFRESH_INTERVAL_MS) return null;
      lastBudgetAt = Date.now();
      const [quota, spent] = await Promise.all([
        checkAgentQuota(run.created_by ?? "").catch(() => null),
        spentFromLedger(run.run_id ?? run.id).catch(() => null),
      ]);
      if (!quota) return null;
      const account = quota.unlimited ? undefined : Math.max(0, quota.remaining ?? 0);
      const fromRun =
        run.budget_usd == null
          ? undefined
          : Math.max(0, Number(run.budget_usd) - Math.max(run.cost_usd, spent ?? 0));
      return minDefined(account, fromRun) ?? null;
    };
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

    /**
     * ── LA BIFURCATION (MIN-224) ────────────────────────────────────────────
     *
     * Tout ce qui précède est l'AMORÇAGE, et il est commun aux deux moteurs :
     * résoudre le dépôt, le modèle, la clé, le contexte du ticket, réveiller la
     * microVM, poser la politique réseau, construire l'historique. Une seule
     * implémentation, donc — un amorçage écrit deux fois aurait divergé, et la
     * divergence se serait lue dans le premier message du système.
     *
     * Ce qui suit, en revanche, se joue ailleurs. La fonction écrit le harness
     * dans la VM, lance la boucle en détaché, persiste l'identifiant de la
     * commande, et REND LA MAIN. Plus de soft-deadline, plus de budget de chunk,
     * plus d'attente : le tour vivra aussi longtemps qu'il lui faudra, et c'est
     * lui qui appellera le plan de contrôle pour se mettre au repos.
     *
     * Le run reste `running` — c'est exact, il tourne. Ce qui le sortira de là,
     * c'est son propre rapport de fin de tour, ou le chien de garde qui aura
     * constaté la mort de son process (`reapDeadVmRuns`, drain.ts).
     */
    if (run.loop_in_vm) {
      // `bootstrapMs` manque exprès : c'est `startVmLoop` qui le pose, parce que
      // c'est lui qui sait quand l'amorçage se termine (cf. `VmJob.bootstrapMs`).
      const job: Omit<VmJob, "bootstrapMs"> = {
        runId: run.id,
        ledgerRunId: run.run_id ?? run.id,
        projectId: run.project_id,
        appOrigin: agentControlOrigin(),
        // Le moteur du tour (MIN-286) : celui de la ligne, sauf si le checkpoint
        // dit le contraire — cf. `effectiveEngine`. C'est `vm/main.ts` qui aiguille
        // dessus, et il ne le relit nulle part.
        engine: effectiveEngine(run),
        model: run.model,
        baseUrl,
        provider,
        llmPlaceholderKey: AGENT_LLM_PLACEHOLDER_KEY,
        reasoningLevel: run.reasoning_level,
        contextWindow,
        inputUsdPerMTok,
        ...(modelPricing ? { pricing: modelPricing } : {}),
        anchor,
        writesToRepo,
        interactive: !run.routine_id,
        chain: !!run.chain_id,
        imageInput,
        webSearch: webSearchAllowed,
        // Le plafond de recherches du tour part AVEC le job : la constante vit
        // dans le module qui facture la recherche, et celui-là n'entre pas dans
        // le bundle de la microVM (cf. `VmJob.webSearchMax`).
        webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
        subagents: {
          models: subagentModels,
          favorites: subagentFavorites,
          maxParallel: subagentMaxParallel,
          allowedIds: subagentScope.allowedIds,
          abovePlanIds: subagentScope.abovePlanIds,
          maxMultiplier: subagentScope.maxMultiplier,
          ...(Object.keys(subagentPricing).length > 0 ? { pricing: subagentPricing } : {}),
        },
        // La conversation, pour la boucle maison. Sous opencode elle part VIDE et
        // c'est `opencodeInput` qui porte le tour (cf. `VmJob.opencodeInput`) :
        // l'historique, là-bas, est le journal d'événements du checkpoint.
        messages: opencodeInput ? [] : messages,
        /**
         * LE JOURNAL D'OPENCODE DU TOUR PRÉCÉDENT — c'est LUI la mémoire d'un run
         * mené par opencode, et il ne descendait pas dans la microVM (MIN-286).
         *
         * Le superviseur le rejoue (`/sync/replay`) pour retrouver sa session ;
         * sans lui, `job.opencode` est `undefined`, il crée une session NEUVE, et
         * le tour repart sans une ligne de sa conversation. Le chemin d'écriture
         * était complet de bout en bout (le superviseur l'exporte, le plan de
         * contrôle l'estampille, `AgentCheckpoint` le déclare) : seule cette
         * lecture-ci manquait, donc rien ne se voyait — pas d'erreur, pas de type
         * qui proteste, juste un agent amnésique d'un tour à l'autre.
         */
        ...(run.checkpoint?.opencode ? { opencode: run.checkpoint.opencode } : {}),
        ...(opencodeInput ? { opencodeInput } : {}),
        instructions,
        usageSeqStart,
        ...(budgetUsd !== undefined ? { budgetUsd } : {}),
        parkedForSubagents: false,
        editedPaths: [...(run.checkpoint?.editedPaths ?? [])],
        repoTouched: run.checkpoint?.repoTouched === true,
        prInlineComments: run.checkpoint?.prInlineComments ?? 0,
        baseBranch,
        workBranch,
        authUrl: target.authUrl,
        commitRef,
        filesFromSha,
        locale: commentLocale,
        feature: usageFeature,
        // Le gabarit du checkpoint est PLUS SERRÉ ici : il devra remonter par le
        // plan de contrôle, dont le corps est plafonné à 4,5 Mo par la plateforme
        // (cf. `VM_MAX_CHECKPOINT_BYTES`). Un checkpoint qui ne remonte pas, c'est
        // la conversation perdue en silence à la fin d'un tour de deux heures.
        checkpointMaxBytes: VM_MAX_CHECKPOINT_BYTES,
      };
      const cmdId = await startVmLoop(sb, job, callStart);
      await stampRun(run.id, {
        loop_command_id: cmdId,
        last_activity_at: new Date().toISOString(),
      });
      /**
       * À PARTIR D'ICI, LE COMPUTE APPARTIENT À LA BOUCLE. Elle facturera le tour
       * entier — amorçage compris, qu'on vient de lui passer. Le `finally` ne doit
       * donc plus rien écrire, sous peine de compter deux fois la même microVM.
       *
       * Posé APRÈS le stamp, et pas avant : si celui-ci échoue, le tour part sans
       * que son `loop_command_id` soit en base — le rapport de fin sera refusé en
       * 409 et le chien de garde n'aura rien à interroger. Personne ne facturera
       * cette microVM-là si ce n'est pas nous.
       */
      vmLoopLaunched = true;
      return "detached";
    }

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
      repoInstructionsForSubagent ??= readRepoInstructions(host).catch(() => null);
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
          // Le ledger passe par la fonction : elle est DANS la fonction (MIN-224).
          recordUsage: recordAiUsage,
          softDeadlineMs: Math.max(1_000, budget),
          // Budget d'usage : le RESTANT snapshoté à l'entrée du chunk, opposé au
          // compteur PARTAGÉ du chunk. C'est ce partage qui fait le plafond : sans
          // lui, cette fille-ci comparerait sa seule dépense au plafond commun, et
          // ses cinq sœurs feraient de même, chacune dans son coin.
          budgetUsd,
          chunkSpend,
          // Ce que la fille paie, dit au registre TOUT DE SUITE (MIN-220) : sa
          // promesse peut ne pas rendre la main avant que le chunk ne la coupe, et
          // sa dépense n'était alors imputée au run par personne.
          onSpend: job.onSpend,
          contextWindow: job.model ? null : contextWindow,
          inputUsdPerMTok: job.model ? null : inputUsdPerMTok,
          // Plafond CUMULATIF : une fille reprise ne repart pas avec quinze rounds
          // neufs à chaque chunk, sinon le garde-fou anti-runaway ne borne rien.
          // Toujours ≥ 1 ici : le cas « plafond atteint » est sorti plus haut, en
          // coupure — c'est ce qui rendait ce `max` dangereux.
          maxRounds: roundsLeft,
          usageSeqStart: job.resumeUsageSeq ?? subagentUsageSeq(job.slot),
          signal: job.signal,
          emit: childEmit,
          // Une fille lit le même `.git/config` que sa mère (MIN-239).
          redact: secrets.redact,
          execTool: makeExecTool({
            host,
            createPr: null,
            // La pull request appartient au parent, comme le ticket et le carnet
            // (et une fille n'a de toute façon aucun de ces tools dans son schéma).
            prTool: null,
            projectPrTool: null,
            issueTool: null,
            scratchpadTool: null,
            webSearch,
            outputSeqBase: SUBAGENT_OUTPUT_SEQ_BASE + job.slot * 1000,
            background: null,
            // Racine marquée VUE (elle vient d'être servie en message ci-dessus) ;
            // le budget repart à zéro pour que la fille puisse charger les
            // instructions des sous-dossiers qu'elle édite, comme le parent.
            instructions: { paths: [...REPO_INSTRUCTION_FILES], bytes: 0 },
            editedPaths,
            verification,
            subagents: null,
            // L'horloge du CHUNK, pas celle de la fille : ce qui tue la fonction
            // est la fin du chunk, et une commande lancée par une fille la tue
            // aussi sûrement qu'une commande du parent.
            chunkRemainingMs,
            // Le MÊME registre que le parent, comme `editedPaths` juste au-dessus :
            // la sandbox est PARTAGÉE (MIN-112), donc un fichier édité par une fille
            // est un fichier édité par le tour — le `files_changed` de fin de tour
            // ne les distingue pas non plus. Sans ça, une délégation d'une demi-heure
            // ne montrait rien au fil, alors que c'est là qu'on regarde le plus.
            onEdit: liveEditHook(liveEdits, emitLive),
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
        /**
         * MÊME seuil que l'admission d'une REPRISE (MIN-212), et pour la même
         * arithmétique : la fille reçoit `left − SUBAGENT_PARENT_RESERVE_MS`, donc
         * opposer `left` au seul `SUBAGENT_MIN_MS` admettait un lancement 120 s trop
         * tôt — et le `Math.max(1_000, budget)` du lanceur lui rendait alors UNE
         * seconde. Le zombie temporel était refermé du côté de la reprise et resté
         * ouvert du côté du lancement : la fille jouait un round non borné par cette
         * seconde (il mord sur la réserve de finalisation du parent), se suspendait,
         * et le chunk suivant était différé pour la reprendre pour de bon.
         *
         * `chunkFitsSubagentResume` plutôt qu'une comparaison écrite ici : c'est la
         * doctrine de `chunk-budget.ts` — deux seuils posés à la main finissent
         * toujours par diverger, et celui-ci avait déjà divergé.
         */
        return chunkFitsSubagentResume(left)
          ? null
          : `Not enough time left in this turn to delegate (${Math.max(0, Math.round(left / 1000))}s left, and delegating needs ${Math.round(SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS / 1000)}s: the sub-agent's own work, plus the time I need to read its report and finish). One launched now would be cut off before it could report. Do what you can yourself and reply — you can delegate at the start of the next turn.`;
      },
    });
    subagentRegistry = subagents;
    subagents.restore(run.checkpoint?.subagents);
    // Filles SUSPENDUES au chunk précédent : elles repartent MAINTENANT, avec leur
    // historique, avant que la boucle du parent ne reprenne. Leurs rapports lui
    // arriveront par le même wakeup que d'habitude.
    const resumed = subagents.resumeSuspended();
    if (resumed > 0) await emit("status", { phase: "subagent_resumed", count: resumed });

    /** Le plan que ce chunk a écrit, noté au passage par `watchPlanWrites` : c'est
     *  lui que la relecture rend au modèle (MIN-237) et que le contrôle de clôture
     *  grep (MIN-236). Même découpage qu'`editedPaths` pour le type-check — le tool
     *  mute, les crochets de fin de tour lisent. */
    const planWrites = newPlanWriteSink();
    /**
     * Le dernier mot du harness : les quatre contrôles de fin de tour, leurs verrous
     * et le budget de chacun, dans un module PARTAGÉ avec la microVM (MIN-240).
     *
     * Ils vivaient recopiés des deux côtés, ce qui rendait la garantie dépendante de
     * `loop_in_vm` en pratique sinon en intention — et c'est comme ça que le même
     * défaut de budget a affamé les deux crochets de plan dans les deux moteurs à la
     * fois. Un seul exemplaire, un seul test.
     */
    const deliveryGate = makeDeliveryGate({
      host,
      emit,
      editedPaths,
      planWrites,
      verification,
      filesFromSha,
      // Le verrou porte sur le TOUR, pas sur le chunk qui l'exécute : semé depuis le
      // checkpoint (MIN-210), rendu à lui à la sortie.
      repoTouched: run.checkpoint?.repoTouched === true,
      logPrefix: "[agent-execute]",
    });

    // Chrono de la boucle : c'est depuis ici que se mesure le budget restant d'un
    // sous-agent (`chunkRemainingMs`).
    loopStartedAt = Date.now();

    const result = await runAgentLoop({
      messages,
      tools: agentToolsFor({
        anchor,
        webSearch: webSearchAllowed,
        webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
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
      // Ancienne forme : la boucle tourne ICI, elle écrit donc au ledger en
      // direct. Dans la nouvelle, ce même paramètre porte un POST vers le plan
      // de contrôle — et c'est tout ce que la boucle sait de la différence.
      recordUsage: recordAiUsage,
      softDeadlineMs,
      budgetUsd,
      // Ce chunk relit déjà le quota à son entrée, donc au pire toutes les cinq
      // minutes ; le crochet resserre à une. Le même dans les deux moteurs — c'est
      // la nouvelle forme qui en avait le plus besoin (un tour dure des heures),
      // mais un plafond qui ne se relit pas est le même défaut des deux côtés.
      refreshBudgetUsd: maybeRefreshBudget,
      chunkSpend,
      contextWindow,
      inputUsdPerMTok,
      // Le token de forge ne sort ni dans un event ni dans le checkpoint (MIN-239).
      redact: secrets.redact,
      execTool: makeExecTool({
        host,
        // Une relecture n'ouvre pas de pull request : le tool n'est pas dans son
        // jeu, et le handler ne lui est pas non plus câblé (deux verrous, pas un).
        // La PORTE (MIN-247) enveloppe le handler des DEUX moteurs, au même endroit
        // et avec le même crochet : le premier appel rend le diff du tour au lieu
        // d'ouvrir. Voir `gateCreatePr`.
        createPr: writesToRepo ? gateCreatePr(createPr, deliveryGate, chunkRemainingMs) : null,
        // Les tools de PLATEFORME sont INJECTÉS depuis MIN-224 (cf. `exec-tool.ts`) :
        // ici les exécuteurs en direct, puisqu'on est dans la fonction ; dans la
        // microVM, les mêmes noms partent au plan de contrôle.
        prTool: prToolCtx ? (name, args) => executePrTool(prToolCtx, name, args) : null,
        projectPrTool: projectPrToolCtx
          ? (name, args) => executeProjectPrTool(projectPrToolCtx, name, args)
          : null,
        // Deux enveloppes, et l'ORDRE compte : `watchPlanWrites` note le plan écrit
        // (MIN-236), puis `gateWritePlan` le relit — il lit le sink que la première
        // vient de remplir. L'inverse contrôlerait le plan du tour précédent.
        issueTool: gateWritePlan(
          watchPlanWrites(
            (name, args) => executeIssueTool(issueToolCtx, name, args),
            planWrites,
          ),
          deliveryGate,
          chunkRemainingMs,
        ),
        scratchpadTool: (name, args) => executeScratchpadTool(scratchpadToolCtx, name, args),
        webSearch,
        outputSeqBase: run.continuations * 1000,
        background,
        instructions,
        editedPaths,
        verification,
        subagents,
        chunkRemainingMs,
        onEdit: liveEditHook(liveEdits, emitLive),
      }),
      pullSteering: () => pullPendingMessages(run.id),
      // Wakeup des sous-agents (MIN-112) : drainé au sommet de chaque round, comme
      // le steering. Le parent n'a jamais attendu — le rapport arrive tout seul.
      pullSubagentReports: async () => subagents.drainReports(),
      /**
       * Dernière chance de livrer AVANT que le tour ne se termine. Si le budget
       * tombe alors qu'une fille tourne encore, on la COUPE ICI plutôt qu'après la
       * boucle : ses fichiers doivent être dans `editedPaths` et dans le diff avant
       * que la porte de livraison ne parle — sinon un sous-agent casse les types en
       * silence et le tour dit « c'est fait ».
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
      // Ce qui fait qu'un « stop » accompagné d'un message n'est PAS un arrêt : la
      // boucle consomme le drapeau et poursuit ce tour-ci avec la consigne (cf.
      // `clearInterrupt` dans agent-loop.ts).
      clearInterrupt: () => clearInterrupt(run.id),
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
    /**
     * CE QUE LA COLONNE VAUT AU REPOS, et c'est le MÊME sens que sur le moteur en
     * microVM (MIN-224) : la dépense du run relue au LEDGER, compute compris.
     *
     * Le cumul ci-dessus est un minorant à deux titres. Il ne connaît que le
     * MODÈLE — la moitié compute de la facture était écrite après les stamps,
     * depuis le `finally`, donc jamais dans la colonne. Et il repart de
     * `run.cost_usd`, que le chunk PRÉCÉDENT n'a pas forcément écrite : un chunk
     * mort sans stamper laisse sa part au ledger et nulle part ailleurs (le trou
     * de MIN-215, mesuré à 0,165908 $ portés pour 0,236836 $ dépensés).
     *
     * D'où l'ordre : on FACTURE le compute de ce chunk, PUIS on relit. Le ledger
     * est alors complet, et le `Math.max` ne sert plus qu'au cas où une insertion
     * best-effort s'est perdue — deux minorants, le plus grand est le plus vrai,
     * et une dépense affichée ne recule jamais.
     *
     * Ce que ça change ailleurs : `recomputeChainSpend` et `medianCostByIntent`
     * lisent enfin la même population des deux côtés. Le PLAFOND de dépense, lui,
     * ne bouge pas — il s'oppose au ledger depuis MIN-215 (`runSpentUsd`).
     */
    const restCostUsd = async (): Promise<number> => {
      await billSandboxCompute();
      const ledger = await spentFromLedger(run.run_id ?? run.id).catch(() => null);
      return Math.max(newCost, ledger ?? 0);
    };
    // `lastFilesSha` amorcé pour TOUTES les mises au repos (ce checkpoint est réutilisé
    // par les chemins WIP/interruption/erreur/budget) : sur le 1er chunk on fixe la
    // baseline, jamais avancée en cours de tour — seule une fin de tour la fait
    // progresser (plus bas). Un chunk ultérieur ne la réinitialise donc pas.
    //
    // Ce qui vaut pour le RUN, quelle que soit la sortie. L'état de TOUR, lui, est
    // ajouté juste en dessous — et c'est ce qui sépare les deux objets (MIN-210).
    const rawCheckpoint: AgentCheckpoint = {
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
      // Ancres déjà posées — par la relecture comme par les tools PR du projet :
      // le plafond des 5 est par RUN, donc son compteur voyage avec le checkpoint
      // (cf. `pr-tools.ts`). Les deux familles partagent l'objet `prInline`.
      ...(prInline.used > 0 ? { prInlineComments: prInline.used } : {}),
    };
    /**
     * RABOTÉ AU GABARIT UNE FOIS POUR TOUTES (MIN-217), ici et pas sur un seul
     * chemin : ce qui suit persiste cet objet sur SIX sorties (fin de tour, WIP,
     * interruption, erreur LLM, budget épuisé, garde-fous anti-runaway), et un
     * checkpoint hors gabarit est une impasse par quelque porte qu'il soit écrit —
     * le tour suivant le rehydrate et rejoue la même fin. Seul le garde-fou le
     * MESURAIT, et il le réécrivait quand même tel quel.
     *
     * No-op tant que le checkpoint tient (le cas normal) : `fitCheckpoint` rend
     * alors l'objet d'entrée, sans copie. `fit.bytes` est la taille AVANT rabotage
     * — c'est elle que le garde-fou juge, plus bas.
     */
    const fit = fitCheckpoint(rawCheckpoint);
    const baseCheckpoint = fit.checkpoint;
    /**
     * Le rabotage est allé jusqu'au DERNIER palier : l'historique n'a pas pu
     * traverser, le tour suivant repartira à froid. Dit ICI, une fois, plutôt que
     * dans le seul garde-fou : n'importe laquelle des six sorties peut avoir eu à
     * payer ce prix, et une conversation qui repart de zéro sans que rien ne le
     * dise, c'est un agent qui semble avoir tout oublié sans raison.
     *
     * Les deux premiers paliers ne se disent pas : ils ne perdent que du
     * re-demandable (une sortie de tool, une image) et laissent au modèle le
     * marqueur qui explique comment y revenir.
     */
    if (fit.dropped.includes("history")) {
      await emit("error", {
        code: "turnHistoryReset",
        message:
          "This session's history grew too large to carry over and had to be reset. The work is kept; the next turn starts fresh.",
        dropped: fit.dropped,
      });
    }
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
      ...(deliveryGate.repoTouched() ? { repoTouched: true } : {}),
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
        // Facturé puis relu ICI, à la dernière milliseconde : le compute de ce
        // chunk comprend le commit et le push qui viennent de se jouer.
        cost_usd: await restCostUsd(),
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
      secrets.addAuthUrl(authUrl);
      secrets.add(token);

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
        ? await commitAndPush(host, {
            authUrl,
            workBranch,
            baseBranch,
            message: commitMessageFromReply(reply, commitRef),
          }).catch((err) => {
            // Un rejet de push recopie l'URL de push, token compris (MIN-239) — et
            // ce message-ci part dans un event ET dans `error_message`.
            pushError = secrets.redact((err as Error).message);
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
        const changed = await changedFiles(host, filesFromSha, pushed.headSha).catch(() => null);
        if (changed && changed.files.length > 0) {
          await emit("files_changed", { files: changed.files, truncated: changed.truncated });
        }
        filesToSha = pushed.headSha;
      }
      // PASSAGE DE RELAIS : la liste dérivée de git est posée (l'`await` ci-dessus
      // l'a écrite en base), la provisoire n'a plus lieu d'être. Sans cet oubli, les
      // deux se superposeraient dans le fil — la même liste deux fois, l'une sans
      // ses compteurs de lignes. L'ordre compte : effacer AVANT d'émettre laisserait
      // un trou, effacer après ne laisse qu'un remplacement.
      if (liveEdits.clear()) {
        emitLive({ text: "", tools: 0, reasoningActive: false, reasoningMs: 0 });
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
      ? await commitAndPush(host, {
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

    /**
     * Le chunk n'a pas travaillé : il a attendu un fournisseur en panne (MIN-219).
     * Ce n'est pas une continuation, c'est une ATTENTE — elle a son propre budget,
     * son propre délai, et elle ne touche pas à celui du tour.
     *
     * Compté sur le checkpoint PRÉCÉDENT : c'est le seul état qui traverse un
     * chunk. Un chunk qui avance en repose un neuf, sans ce champ — le compteur
     * ne mesure donc que des pannes CONSÉCUTIVES, ce qui est bien ce qu'on veut
     * borner (un hoquet toutes les dix minutes ne doit rien épuiser).
     */
    const providerStalled =
      result.status === "suspended" && result.suspendReason === "transient_error";
    const stall = providerStalled
      ? planProviderStall(run.checkpoint?.providerRetries ?? 0)
      : null;
    const providerGaveUp = stall?.requeue === false;

    // suspended — garde-fous anti-runaway PAR TOUR : au-delà, on REPOSE (avec un
    // event d'erreur) au lieu d'échouer — la session reste reprennable.
    //
    // Une attente ne consomme PAS de continuation : le compteur borne les chunks
    // qui ont fait parler le modèle, et celui-ci n'y est jamais arrivé. Le
    // garde-fou d'horloge, lui, continue de courir (`window_started_at` est
    // conservé de part et d'autre) — c'est lui le filet ultime d'un tour qui
    // n'avance plus, attentes comprises.
    const nextContinuations = run.continuations + (providerStalled ? 0 : 1);
    const wallClock = run.window_started_at
      ? Date.now() - Date.parse(run.window_started_at)
      : Date.now() - callStart;
    // La taille AVANT rabotage (MIN-217) : un tour dont l'état a explosé reste un
    // tour qu'on arrête, même si `fitCheckpoint` a su le ramener au gabarit — le
    // rabotage sert au tour SUIVANT, pas à absoudre celui-ci.
    const checkpointTooBig = fit.bytes > MAX_CHECKPOINT_BYTES;

    if (
      providerGaveUp ||
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
       * Trois codes plutôt qu'un : un tour qui a duré, un tour devenu trop
       * volumineux et un fournisseur en panne ne se corrigent pas pareil — et le
       * troisième ne se corrige pas du tout, il s'attend. Il passe DEVANT les
       * deux autres : quand la patience du fournisseur s'épuise, c'est la panne
       * qui arrête le tour, quoi qu'en disent les compteurs (MIN-219). Le tour
       * mourait ici en annonçant une « limite de durée » qu'aucune horloge
       * n'avait atteinte.
       *
       * « Envoyez un message pour en ouvrir un nouveau » ne promet plus rien que
       * le code ne tienne (MIN-217) : le checkpoint qu'on persiste juste en
       * dessous a été raboté au gabarit, donc le tour suivant repart pour de bon.
       * Ce qu'il a coûté, s'il a coûté, a été dit plus haut par `historyReset`.
       */
      await emit("error", {
        code: providerGaveUp
          ? "providerUnavailable"
          : checkpointTooBig
            ? "turnTooBig"
            : "turnTooLong",
        // Repli pour un client qui ne connaîtrait pas le code (et trace lisible
        // dans la table d'events) : en anglais, comme tout ce qui n'est pas de
        // l'UI dans ce fichier.
        message: providerGaveUp
          ? "The model provider kept failing, so this turn was paused. Send a message to carry on."
          : checkpointTooBig
            ? "This turn grew too large to carry on. Send a message to start a fresh one."
            : "This turn reached its time limit. Send a message to carry on.",
      });
      const pending = await restStamp({
        checkpoint,
        // Ce que le fournisseur a répondu en dernier, gardé sur la ligne du run :
        // c'est la seule trace qui dise LAQUELLE des pannes (429, 502, réseau) a
        // fini par arrêter le tour.
        ...(providerGaveUp && result.errorMessage
          ? { error_message: cap(result.errorMessage, 1000) }
          : {}),
      });
      if (!pending) await notifyAgentRun(run, "agent_failed");
      return "completed";
    }

    /**
     * Panne du fournisseur : re-queue DIFFÉRÉ, et le compteur d'attente voyage
     * avec le checkpoint (MIN-219). Le délai est la seule chose qui sépare une
     * reprise d'un acharnement — le drain reclaim dans le même process, donc un
     * `not_before` au présent renvoyait le chunk dans la même panne à la seconde
     * près.
     *
     * SAUF si un message attend : l'utilisateur qui écrit pendant la panne est le
     * seul signal qui vaille qu'on retente tout de suite, et le faire patienter
     * dix minutes avant d'être seulement LU serait pire que le défaut d'origine.
     * Le compteur, lui, monte quand même : la sortie de secours reste bornée.
     */
    if (stall?.requeue) {
      const steering = await hasPendingRunMessages(run.id).catch(() => false);
      const delayMs = steering ? 0 : stall.delayMs;
      await stampRun(run.id, {
        status: "queued",
        checkpoint: { ...checkpoint, providerRetries: stall.retries },
        sandbox_id: sandboxName(sandbox),
        sandbox_stopped_at: null,
        continuations: nextContinuations,
        attempts: 0,
        not_before: new Date(Date.now() + delayMs).toISOString(),
        cost_usd: await restCostUsd(),
      });
      return "suspended";
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
      cost_usd: await restCostUsd(),
    });
    return "suspended";
  } catch (err) {
    // Substitué AVANT tout usage (MIN-239) : un `git clone` refusé recopie l'URL de
    // clone entière — token compris — dans son stderr, et ce message part dans
    // l'event `error` puis dans `agent_runs.error_message`, lu dans l'UI.
    const message = secrets.redact(err instanceof Error ? err.message : String(err));
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
     *
     * Le compute de ce chunk est facturé AVANT la relecture (MIN-224), comme sur
     * les repos sains : sinon la colonne d'un chunk mort porterait le modèle mais
     * pas la microVM qu'il a bel et bien réveillée, et les deux moteurs
     * n'écriraient toujours pas la même chose.
     */
    await billSandboxCompute();
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
    /**
     * LE FILET, et plus le chemin normal (MIN-224). Les mises au repos facturent
     * désormais AVANT de relire le ledger, pour que `cost_usd` veuille dire la
     * même chose sur les deux moteurs ; `billSandboxCompute` est idempotent, donc
     * ce qui passe ici est ce qui n'est passé par aucun repos — un throw hors
     * `catch`, une sortie que personne n'a prévue.
     *
     * PAS quand la boucle est PARTIE dans la microVM : le tour n'est pas fini
     * quand cette fonction rend la main, et son wall-clock est tenu par la boucle
     * elle-même — amorçage compris, qu'on lui a passé dans son job
     * (`VmJob.bootstrapMs`). Facturer ici en plus compterait deux fois la même
     * microVM. La garde vit dans `billSandboxCompute`.
     *
     * MAIS ON FACTURE QUAND ELLE N'EST PAS PARTIE, et c'est le trou qui manquait.
     * Un amorçage qui LÈVE — clone en échec, `writeFiles` refusé, politique
     * réseau invalide — a quand même réveillé une machine, parfois cloné un dépôt
     * entier, et tombe dans le `catch` sans qu'aucun rapport ne vienne jamais. Le
     * chien de garde ne le rattrape pas non plus : il ne balaie que les runs
     * `running`, et celui-ci vient d'être mis au repos. La fonction est donc le
     * seul témoin de ce compute-là.
     */
    await billSandboxCompute();
  }
}
