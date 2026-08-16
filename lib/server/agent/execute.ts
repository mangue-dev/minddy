import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { joinedPage } from "@/lib/server/resource-select";
import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";
import { resolveRepoCloneTarget, type RepoCloneTarget } from "./repo-access";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { getGithubBotCommitIdentity } from "@/lib/server/git/github-app";
import { getOrCreateAgentSandbox, sandboxHost, sandboxName, type Sandbox } from "./sandbox";
import { cloudLayout } from "./harness-layout";
import { cloneRepo, clonePullRequest, revParseHead, repoBackgroundRunner } from "./repo-host";
import { BackgroundJobs } from "./background";
import { scopeSubagentModels } from "./subagent-config";
import { getSubagentFavorites, maxParallelSubagents } from "./subagent-app-config";
import { getAgentModelsForUser } from "./models-catalog";
import { SecretRedactor } from "./redact";
import { readRepoInstructions, REPO_INSTRUCTION_FILES, type InstructionsState } from "./repo-instructions";
import type { AgentChatMessage, EmitAgentEvent } from "./agent-contract";
import { isWebSearchEnabled, MAX_WEB_SEARCHES_PER_TURN } from "@/lib/server/web-search";
import {
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
import { executionPolicyFor } from "./policy";
import { promptWithMentions } from "@/lib/agent-mentions";
import { loadPrReviewBoot, loadPrRunContext, pullRequestHeadRef, pullRequestLocalBranch } from "./pr-run";
import {
  resolveAgentApiKey,
  getModelContextWindow,
  getModelInputPrice,
  getModelPricing,
  supportsImageInput,
} from "./model";
import { agentSandboxName, buildAgentNetworkPolicy, AGENT_LLM_PLACEHOLDER_KEY } from "./network-policy";
import { startVmLoop } from "./vm-launch";
import {
  isCurrentRepoJob,
  VM_PROTOCOL_VERSION,
  type VmJob,
} from "./vm/protocol";
import { mintRunKey, revokeRunKey, runKeyCapUsd } from "./run-key";
import { agentControlOrigin } from "./origin";
import { forgeFor, type Forge } from "./forge";
import { prStateFromRef } from "./pull-requests";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  resolveRunPrefs,
  prTerm,
  SANDBOX_USAGE_SEQ_BASE,
  type PrLandingContext,
} from "./pr-landing";
import {
  stampRun,
  appendEvent,
  previousRunSummaryForIssue,
  previousRunSummaryForPr,
  branchHasPriorRun,
  clearInterrupt,
  hasPendingRunMessages,
  loadRunJournal,
  notifyAgentRun,
  type AgentRun,
} from "./runs";
import { checkAgentQuota } from "./quota";
import { generatedAgentBranchName } from "./branch-name";

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

/** Borne du re-queue « message en attente » sur erreur mid-turn (catch final) :
    `attempts` (incrémenté à chaque claim) n'est pas remis à zéro sur ce chemin,
    donc une erreur persistante s'arrête après ce nombre de claims. */
const MAX_ERROR_REQUEUE_ATTEMPTS = 2;
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

/**
 * UNE CONVERSATION QUE PLUS PERSONNE NE SAIT RELIRE (MIN-286) — le seul reste de
 * la boucle maison après sa suppression.
 *
 * Les deux moteurs ne gardaient pas leur mémoire au même endroit :
 * `checkpoint.messages` pour la boucle, `checkpoint.opencode` pour le journal
 * d'événements. Un run mené par la boucle, repris aujourd'hui, part donc chez
 * opencode avec un journal VIDE. Il n'y a rien à sauver là — le format n'a pas de
 * traducteur, et en écrire un pour des conversations closes depuis le 10 août ne
 * vaut pas son code.
 *
 * Ce qui n'est pas acceptable, en revanche, c'est de le taire : le modèle croirait
 * poursuivre un échange qu'il n'a jamais lu, et l'utilisateur lirait un agent
 * amnésique sans savoir pourquoi. On le DIT donc dans le prompt du tour — c'est
 * exactement la place de la voix du harness, et le modèle en parle de lui-même.
 */
function priorConversationLost(run: AgentRun): boolean {
  const saved = run.checkpoint;
  return !!saved?.messages?.length && !saved.opencode;
}

/** La phrase que le tour repris lit à la place de l'historique qu'il n'a plus. */
const PRIOR_CONVERSATION_LOST_NOTE: Record<string, string> = {
  fr: "Note : les tours précédents de cette session ont été joués par l'ancien moteur, dont l'historique n'est pas lisible ici. Tu ne vois pas cet échange — repars du ticket et de l'état du dépôt, et dis-le si ça change quelque chose.",
  en: "Note: the earlier turns of this session ran on the previous engine, whose history cannot be read here. You cannot see that exchange — work from the issue and the state of the repository, and say so if it matters.",
};

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

async function loadIssueContext(
  run: AgentRun,
  issueId: string,
  opts: { includePromptContext?: boolean } = {},
): Promise<IssueContext> {
  const service = getServiceClient();
  const includePromptContext = opts.includePromptContext !== false;
  const [{ data: issue }, { data: project }, { data: attachmentRows }] = await Promise.all([
    service
      .from("issues")
      // Une session opencode reprise possède déjà son amorce dans sa base locale.
      // Ne relire ni le long markdown ni le plan ne peut influencer son prochain
      // prompt ; c'était du transport et du décodage avant chaque premier token.
      .select(includePromptContext ? "number, title, description, plan" : "number, title")
      .is("deleted_at", null)
      .eq("id", issueId)
      .maybeSingle(),
    service.from("projects").select("key, name").eq("id", run.project_id).maybeSingle(),
    includePromptContext
      ? service
          .from("attachments")
          .select(
            "id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(title)",
          )
          .eq("issue_id", issueId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
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
  opts: {
    deadlineMs: number;
    /**
     * LE TOUR EST PRÉPARÉ, PAS LANCÉ (MIN-293) — appelé quand `run.local_exec`,
     * juste avant que la fonction rende `"detached"`.
     *
     * Un rappel plutôt qu'un élargissement d'`ExecuteOutcome` : le drain est
     * l'autre appelant, il ne le passe pas, et il ne doit rien avoir à relire. Il
     * ne draine d'ailleurs jamais un run local (cf. `claimableRuns`, drain.ts) —
     * le rappel n'a donc qu'un seul appelant, la route de déclenchement.
     *
     * `layout` et `bootstrapMs` en sont absents : ils appartiennent à la machine
     * (cf. [lib/desktop/local-turn.ts](../../desktop/local-turn.ts)).
     */
    onLocalAssignment?: (
      job: Omit<VmJob, "layout" | "bootstrapMs">,
      meta: { repoFullName: string },
    ) => void;
  },
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
  /**
   * La boucle a-t-elle VRAIMENT été lancée dans la microVM (MIN-224) ? C'est ce
   * qui décide qui facture le compute de ce passage, et il n'y a pas de troisième
   * réponse : soit la boucle tourne et c'est elle qui rendra la note (amorçage
   * compris), soit elle n'a jamais démarré et la fonction est la seule à savoir
   * qu'une microVM a été réveillée pour rien. Voir le `finally`.
   */
  let vmLoopLaunched = false;
  /** Un tour local ne démarre jamais de microVM. Calculé avant le premier event
   *  pour pouvoir recouvrir son écriture avec toute la préparation du job. */
  const localTurn = run.local_exec === true;

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
    const runningEvent = emit("status", { status: "running", continuation: run.continuations });
    // Le cloud doit montrer l'ouverture de la sandbox avant de la réveiller. En
    // local, l'UI connaît déjà le statut via le claim : on laisse cette écriture
    // se faire pendant les lectures de contexte, puis on la rejoint avant retour.
    if (!localTurn) await runningEvent;

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
        last_activity_at: new Date().toISOString(),
        interrupt_requested: false,
      });
      return "interrupted";
    }

    // Ces lectures sont indépendantes. Les sérialiser retardait le job local
    // avant même que le Mac puisse démarrer opencode, alors que le premier token
    // ne dépend que de leur résultat final. On conserve l'attente de la cible en
    // premier pour garder son erreur et sa frontière de sécurité inchangées.
    const targetPromise = resolveRepoCloneTarget(run.project_id);
    const issuePromise = run.issue_id
      ? loadIssueContext(run, run.issue_id, {
          // Sur une reprise opencode, le prompt est volontairement vide : le
          // modèle relit sa base SQLite et le steering arrive via le superviseur.
          // Le contexte riche (description, plan, ressources) est donc inutile.
          includePromptContext: !run.checkpoint?.opencode?.sessionId,
        })
      : Promise.resolve(null);
    const prRunPromise = run.pull_request_id
      ? loadPrRunContext(run.pull_request_id)
      : Promise.resolve(null);
    const prefsPromise = resolveRunPrefs(run);
    const aiSurface = run.chain_id || run.routine_id ? "automations" : "agent";
    const quotaAndLedgerPromise = Promise.all([
      checkAgentQuota(run.created_by ?? "", aiSurface).catch(() => null),
      spentFromLedger(run.run_id ?? run.id),
    ]);
    // Un run BYOK est figé sur son propre payeur. Si la configuration a disparu,
    // ou si un endpoint local a été demandé depuis le cloud, la préparation
    // échoue explicitement : elle ne peut jamais reprendre la clé plateforme.
    const endpointPromise = resolveAgentApiKey(run.created_by, aiSurface, {
      allowLocal: localTurn,
      requireByok: run.key_mode === "byok",
    });

    // Cible de clone (token frais pour ce chunk) + client PR/MR du provider.
    const target = await targetPromise;
    if (!target) throw new Error("No repository linked to this project");
    secrets.addAuthUrl(target.authUrl);
    secrets.add(target.token);
    const forge = forgeFor(target.provider);
    // Cette identité peut demander la forge au premier tour du process. Elle ne
    // dépend d'aucun autre contexte : la démarrer ici la recouvre avec le quota,
    // les préférences, le ticket et la construction du prompt.
    const committerPromise = run.pull_request_id
      ? Promise.resolve({ name: "minddy agent", email: "agent@minddy.app" })
      : resolveCommitterIdentity(target);

    // Ancrage du run, à TROIS valeurs : ticket minddy, CARNET (MIN-84, la note du
    // lanceur est l'instruction), ou PULL REQUEST (MIN-168 — une session de
    // relecture, en lecture seule sur le dépôt).
    const [issue, prRun, prefs, quotaAndLedger, endpoint] = await Promise.all([
      issuePromise,
      prRunPromise,
      prefsPromise,
      quotaAndLedgerPromise,
      endpointPromise,
    ]);
    // Un run ancré à une PR dont la ligne a disparu ne doit PAS retomber en run
    // carnet : il se croirait autorisé à créer une branche et à pousser dessus.
    if (run.pull_request_id && !prRun) {
      throw new Error("The pull request this review was anchored to no longer exists");
    }
    const anchor: AgentAnchor = issue ? "issue" : prRun ? "pr" : "notebook";
    const policy = executionPolicyFor({
      hasIssueContext: issue !== null,
      reviewingPullRequest: prRun !== null,
      unattended: run.routine_id !== null,
    });
    /**
     * LE TOKEN QUI DESCEND DANS LA MICROVM, et il n'est plus celui d'au-dessus
     * (MIN-327).
     *
     * `target` reste le token de la FONCTION : il ouvre des PR, commente, relit,
     * merge, et il ne sort jamais du process. Celui-ci part dans le `.git/config`
     * de la VM, là où le modèle lance du shell — il n'a donc que ce que `git`
     * demande, et rien de plus :
     *
     * - un run de ticket ou de carnet POUSSE → `contents: write` ;
     * - une RELECTURE ne pousse rien (`writesToRepo` ci-dessous) et son contenu
     *   vient d'un fork inconnu → `contents: read`. C'est le cœur du ticket : elle
     *   recevait un token en écriture, sur tous les dépôts de l'installation.
     *
     * Le mint peut échouer (forge en panne entre les deux appels) : on retombe sur
     * `target` plutôt que de faire mourir le tour. C'est le pire cas, et il est
     * celui d'avant.
     */
    const vmTarget = localTurn
      ? target
      : (await resolveRepoCloneTarget(
          run.project_id,
          policy.repository === "read" ? "repo-read" : "repo-write",
        ).catch(() => null)) ?? target;
    secrets.addAuthUrl(vmTarget.authUrl);
    secrets.add(vmTarget.token);
    /**
     * Le harnais écrit-il dans le DÉPÔT pour cette session ? Faux pour une
     * relecture, et c'est la moitié harnais de la garantie « aucune écriture » —
     * l'autre moitié étant le jeu de tools, qui n'a aucune édition. Une phrase de
     * prompt ne tiendrait ni l'une ni l'autre.
     */
    const writesToRepo = policy.repository === "write";
    const project = issue
      ? { key: issue.projectKey, name: issue.projectName }
      : await loadProjectContext(run.project_id);
    // Référence lisible du run dans les messages de commit (`wip(...)`).
    const commitRef = issue?.identifier ?? "agent";
    // Langue du commentaire + du résumé de l'agent = celle du lanceur (défaut owner),
    // et statut d'atterrissage des tickets créés par l'agent = son réglage de compte.
    const { locale: commentLocale, numoDefaultStatus } = prefs;
    // Session de relecture : les branches sont celles de la PR — sa base est le
    // point de comparaison du diff, sa tête ce qu'on relit. Ailleurs, la base
    // choisie au lancement et la branche de travail du run.
    const baseBranch = (prRun?.baseBranch || run.base_branch) ?? target.defaultBranch;
    const workBranch = prRun
      ? pullRequestLocalBranch(prRun)
      : run.branch_name ??
        generatedAgentBranchName({
          runId: run.id,
          issueIdentifier: issue?.identifier,
          conversationTitle: run.title,
          prompt: run.prompt,
        });

    /**
     * Budget d'usage RESTANT à l'entrée du chunk. Snapshoté une fois ici : la
     * boucle compare son coût accumulé à ce restant, sans relire l'usage à chaque
     * round. En BYOK le COMPTE est illimité, mais un run local porte son propre
     * `budget_usd`, choisi par l'utilisateur.
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
    const [quotaNow, ledgerSpentUsd] = quotaAndLedger;

    // Endpoint du run (BYOK de l'utilisateur, ou clé plateforme OpenRouter).
    // Résolu AVANT l'amorce de l'historique : le prompt système ne décrit que les
    // tools réellement offerts, et web_search en dépend. Et avant la microVM
    // depuis MIN-223 : c'est cette clé (ou celle du run, ci-dessous) que le
    // firewall injectera — la politique réseau ne peut pas se construire sans.
    const { apiKey, baseUrl, provider, mode: keyMode } = endpoint;

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
    // En local, la clé ne doit jamais entrer dans le job : le proxy la demande
    // une seule fois à `/llm-key`, qui la minte et persiste son hash. La minter
    // aussi ici créait puis révoquait une clé avant le premier token.
    if (keyMode === "platform" && !localTurn) {
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

    /**
     * ─────────────────────────────────────────────────────────────────────────
     * LE TOUR JOUE-T-IL SUR UNE MACHINE ? (MIN-293)
     *
     * À partir d'ici, et jusqu'au lancement, la fonction fait exactement le même
     * travail dans les deux cas — c'est le même tour, avec le même contexte, le
     * même modèle et le même plafond. **Trois choses seulement disparaissent, et
     * chacune parce qu'elle demande un DISQUE que le serveur n'a pas :**
     *
     * 1. **la microVM** — on n'en réveille aucune, donc rien n'est cloné, aucune
     *    politique réseau n'est posée, et `billSandboxCompute` ne facture rien
     *    (sa garde `!sandbox` suffit, elle était déjà là) ;
     * 2. **la baseline du diff** (`revParseHead`) — c'est le HEAD d'une machine
     *    que la fonction n'a jamais vue. Le job part avec `""`, et **le harness
     *    la résout lui-même** : `job.filesFromSha || current?.parent`
     *    ([supervisor.ts](vm/supervisor.ts)), écrit pour ce cas exact en MIN-358 ;
     * 3. **la lecture d'`AGENTS.md`** — le message dédié qu'on injecte au modèle
     *    ne peut pas être fabriqué ici. Ce n'est PAS une perte de contexte :
     *    `instructions.paths` est une constante (`REPO_INSTRUCTION_FILES`), elle
     *    part telle quelle, et opencode charge ces fichiers **depuis le disque**
     *    par sa propre clé `instructions` ([opencode-config.ts](vm/opencode-config.ts)).
     *    Le modèle les lit donc quand même ; c'est l'emballage minddy qui manque,
     *    et le compte d'octets qui reste à zéro.
     *
     * Les jobs de fond suivent : `run_background` n'est pas servi sur une machine
     * (cf. `agentToolsFor`), et le registre de cette fonction n'a jamais servi
     * qu'à un `stopAll` de filet dans le chemin détaché.
     *
     * ⚠ **La fonction ne LANCE rien dans ce cas** : elle prépare et rend
     * l'affectation par `onLocalAssignment`. La présence, le claim et
     * l'aiguillage appartiennent à MIN-294 ; ici, le seul appelant est la route
     * de déclenchement de dév.
     */
    // Sandbox : réveille la microVM (filesystem restauré depuis le snapshot
    // persistant → reprise rapide) ; sinon `onCreate` clone la branche de travail.
    // Nom déterministe → même microVM/snapshot d'un tour à l'autre.
    const { sandbox: sb } = localTurn ? { sandbox: null } : await getOrCreateAgentSandbox({
      name: agentSandboxName(run.id),
      // MIN-223 : la microVM ne détient aucun secret DE MINDDY (le token de forge,
      // lui, est dans son `.git/config` par construction — cf. `vmTarget`).
      // Reposée à chaque réveil — la politique survit à la reprise, mais avec la
      // clé d'HIER dedans, et celle-là est révoquée à la mise au repos.
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
          await clonePullRequest(sandboxHost(fresh, cloudLayout()), {
            // `vmTarget` : ce que le clone écrit dans `.git/config` reste lisible
            // pour toute la vie de la microVM. Pour une relecture, c'est un token
            // en LECTURE, sur le seul dépôt lié (MIN-327).
            authUrl: vmTarget.authUrl,
            baseBranch,
            headRef: pullRequestHeadRef(prRun.provider, prRun.number),
            headBranch: prRun.headBranch,
            localBranch: workBranch,
            baseSha,
          });
          return;
        }
        // L'identité de committer n'est plus écrite dans le clone (MIN-358) :
        // elle voyage dans le job et se pose par `git -c`, sur la seule commande
        // qui commite. Un geste qu'on n'a qu'à un endroit ne peut pas fuir dans
        // le dépôt de quelqu'un.
        await cloneRepo(sandboxHost(fresh, cloudLayout()), {
          authUrl: vmTarget.authUrl,
          baseBranch,
          workBranch,
        });
      },
    });
    sandbox = sb;
    /**
     * Les mains sur le dépôt, par RPC (MIN-224). Dans l'ancienne forme c'est le
     * seul chemin ; dans la nouvelle, la fonction n'en garde que l'amorçage (une
     * lecture d'`AGENTS.md`, l'écriture du bundle) et c'est la boucle, dans la
     * microVM, qui reprend les mêmes gestes sur le disque local.
     *
     * `null` SUR UN TOUR LOCAL (MIN-293) : le dépôt est sur un disque que la
     * fonction ne peut pas atteindre. Les trois appelants sont gardés un par un
     * plutôt que par un hôte factice — un hôte qui rendrait des réponses vides
     * ferait passer « je ne peux pas lire » pour « il n'y a rien à lire », et
     * c'est exactement la distinction qui compte pour `AGENTS.md`.
     */
    const host = sb ? sandboxHost(sb, cloudLayout()) : null;

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
      // Un tour local n'a pas de microVM à nommer, et lui en écrire une serait
      // pire qu'inutile : `handleControlPlaneRequest` compare `sandbox_id` au nom
      // signé de l'appelant, et le chien de garde interroge la plateforme sur ce
      // nom-là. Une valeur inventée ferait mentir les deux.
      ...(sandbox ? { sandbox_id: sandboxName(sandbox), sandbox_stopped_at: null } : {}),
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


    // La machine est là. C'est la seule chose que le fil ne pouvait pas deviner :
    // entre le `status: running` du haut de ce chunk et le premier pas de l'agent,
    // il se passe plusieurs secondes de réveil de microVM et de clone — le fil
    // affichait « travaille » alors que personne ne travaillait encore. Cet event
    // ferme cette fenêtre : avant lui « ouverture de la sandbox », après lui le
    // travail (cf. `sandboxReady` dans components/agent/agent-event-feed.tsx).
    if (sandbox) await emit("status", { phase: "sandbox_ready" });

    // Baseline du « diff par tour » (MIN-46, event `files_changed`) : HEAD à l'entrée
    // du chunk. `filesFromSha` est le point depuis lequel la fin de tour diffe — le
    // dernier sha émis (persisté dans le checkpoint, survit aux chunks WIP), ou ce
    // baseline au tout premier chunk du run (« rien de changé encore »).
    //
    // ⚠ SUR UN TOUR LOCAL (MIN-293), c'est le HEAD d'une machine que la fonction
    // n'a jamais vue : le job part avec `""`, et le harness la résout lui-même
    // (`job.filesFromSha || current?.parent`, supervisor.ts, écrit pour ce cas
    // exact en MIN-358).
    const baselineHead = host ? await revParseHead(host) : "";
    const filesFromSha = run.checkpoint?.lastFilesSha ?? baselineHead;

    // Recherche web : réservée aux runs qui parlent à OpenRouter (quota minddy ou
    // BYOK OpenRouter — la recherche part alors sur la MÊME clé que le run, donc
    // sur la même facture). Ailleurs le tool n'est pas offert (cf. agentToolsFor).
    // Plafond par chunk, et une ligne `web_search` au ledger par recherche.
    const webSearchAllowed = provider === "openrouter" && (await isWebSearchEnabled());

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
    if (run.checkpoint?.opencode?.sessionId) {
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
       * ET C'EST LA SEULE MÉMOIRE QU'ON SACHE ENCORE LIRE. Un vieux checkpoint
       * de la boucle maison porte sa conversation dans `messages` ; cette
       * branche-ci ne le reconnaît pas, il retombe donc sur l'amorce FROIDE —
       * contexte du ticket recomposé, plus la phrase de `priorConversationLost`
       * qui dit au modèle ce qu'il ne voit pas. Le rejouer serait pire : il
       * partirait en prompt, et l'agent relirait une conversation entière comme
       * une consigne qui vient d'arriver.
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
      /**
       * PAS DE MESSAGE `system` (MIN-286, 2026-08-14) : opencode a le sien, et le
       * nôtre — l'ancrage minddy — descend par `instructions`, reconstruit à chaque
       * tour. L'amorce n'assemble donc plus qu'un message UTILISATEUR, celui dont
       * `userPromptFromMessages` tire le prompt du tour.
       */
      messages = [{ role: "user", content: contextMsg }];
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
      //
      // L'ANCRAGE DÉCIDE DE LA SOURCE (MIN-328) : sur une relecture, le clone est
      // sur la TÊTE de la pull request — le dépôt de l'auteur, pas celui du projet.
      // Les instructions sont alors lues à la base (`pr-base`), ou pas du tout.
      // `prRun` et pas `anchor` : c'est le CLONE qui décide, et c'est `prRun` qui
      // fait cloner sur la tête (cf. `onCreate`).
      //
      // `null` SUR UN TOUR LOCAL : le disque est ailleurs. Le modèle lit quand
      // même ces fichiers — opencode les charge par sa propre clé `instructions`,
      // qui reçoit `instructions.paths` juste en dessous — et c'est l'emballage
      // minddy qui manque, pas le contenu.
      const repoInstructions = host
        ? await readRepoInstructions(host, prRun ? "pr" : anchor)
        : null;
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
          content: promptWithMentions(
            issue ? run.prompt.trim() : buildScratchpadPrompt(run.prompt.trim(), { mcp: false }),
            run.prompt_mentions,
          ),
        });
      }
    }

    /**
     * CE QUE LE MOTEUR OPENCODE REÇOIT DU TOUR (MIN-286) : son ancrage minddy et
     * le message à poster. Composé ICI, dans la fonction, comme tout le reste de
     * l'amorçage — la microVM n'a ni le ticket, ni les favoris, ni la locale.
     *
     * L'ancrage se reconstruit à chaque tour (cf. `VmJob.opencodeInput`).
     *
     * Le prompt, lui, est ce que l'amorce a mis dans les messages UTILISATEUR :
     * contexte du ticket (ou de la pull request), travail hérité, instructions du
     * dépôt, demande du lanceur. Sur un tour repris, l'amorce n'a rien écrit —
     * l'historique vit dans le journal d'opencode — et le prompt vient du steering.
     */
    /**
     * DANS QUEL DÉPÔT CE TOUR ÉCRIT (MIN-358). Une constante ici, et c'est le
     * fait : cette fonction a créé la microVM et cloné dedans, elle ne sait
     * produire qu'un clone. Le mode `current` appartient au lanceur de bureau
     * (MIN-293), qui travaille dans un dépôt existant avant lui.
     *
     * Nommé plutôt qu'écrit deux fois : le job le porte, et l'ancrage servi au
     * modèle en dépend — dire l'un sans l'autre donnerait un tour qui écrit d'une
     * façon et se croit dans l'autre.
     */
    const repoMode: VmJob["repoMode"] = "clone";
    /**
     * ⚠ ET POURTANT L'ANCRAGE NE SE LIT PAS SUR `repoMode` (MIN-364).
     *
     * `repoMode` est un champ que la MACHINE remplace — `assignmentToJob` y pose
     * `"current"` en valeur ([lib/desktop/local-turn.ts](../../desktop/local-turn.ts)).
     * Le `"clone"` ci-dessus n'est donc, sur un tour local, qu'un placeholder que
     * personne ne joue. L'ancrage, lui, est composé ICI et part tel quel : le lire
     * sur ce placeholder servait au tour local **le bloc git du cloud** — « the
     * harness commits and pushes whatever you changed at the end of each turn »,
     * alors que le harness local ne commite rien (D2bis-B) et que le garde-fou
     * refusait au modèle de commiter. C'est la troisième version des trois textes
     * du §1 de l'audit du 2026-08-15, et la plus fausse des trois.
     *
     * Le fait qu'il faut dire au modèle est « ce checkout existait avant toi », et
     * `run.local_exec` est ce qui le sait côté serveur.
     */
    // Le worktree local est bien sur la machine de l'utilisateur, mais pas dans
    // son checkout : il reprend donc les règles d'un clone (le harnais livre le
    // commit), tandis que le mode historique garde la protection du dépôt courant.
    const currentRepo =
      (localTurn && !run.local_worktree) || isCurrentRepoJob({ repoMode });
    const opencodeInput = {
      anchorInstructions: buildOpencodeAnchor({
        locale: commentLocale,
        anchor,
        currentRepo,
        interactive: !run.routine_id,
        webSearch: webSearchAllowed,
        webSearchMax: MAX_WEB_SEARCHES_PER_TURN,
        chain: !!run.chain_id,
        images: imageInput,
        // Une relecture ne délègue pas, et un tour sans place de fille ne doit pas
        // lire une section qui décrit un tool que la config ne sert pas.
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
      /**
       * Le tour repris d'une session jouée par l'ancien moteur lit d'abord ce
       * qu'il a perdu (cf. `priorConversationLost`) : sans cette phrase, il
       * répondrait à un message dont il ne voit pas le contexte.
       */
      prompt: priorConversationLost(run)
        ? `${PRIOR_CONVERSATION_LOST_NOTE[commentLocale] ?? PRIOR_CONVERSATION_LOST_NOTE.en}\n\n${userPromptFromMessages(messages)}`
        : userPromptFromMessages(messages),
    };

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
    const _landing: PrLandingContext = {
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
    // Jobs de fond du chunk (MIN-114). Ils meurent AVANT chaque push (un watcher
    // qui écrit pendant le `git add -A` commiterait n'importe quoi) et de toute
    // façon en fin de chunk (`finally`) : un processus oublié mangerait la microVM
    // jusqu'au reaper, et serait encore là au tour suivant sans que le modèle le
    // sache. Le registre ne survit pas au chunk — c'est assumé, et le tool le dit.
    //
    // AUCUN SUR UN TOUR LOCAL (MIN-293) : `run_background` n'est pas servi sur
    // une machine (cf. `agentToolsFor`), et ce registre-ci n'a de toute façon
    // jamais servi qu'au `stopAll` de filet du `finally` depuis que la boucle
    // vit dans la microVM.
    backgroundJobs = host
      ? new BackgroundJobs(repoBackgroundRunner(host), run.continuations * 1000)
      : null;

    // Fichiers édités depuis le dernier type-check (MIN-110). Vidé à chaque check :
    // un tour qui ne touche à rien après coup n'en relance pas un second. PARTAGÉ
    // avec les sous-agents (MIN-112) : c'est ce que le type-check lit, et une fille
    // qui casse un type doit le faire dire avant que le parent ne réponde.
    //
    // SEMÉ depuis le checkpoint (MIN-210), comme `instructions` et `lastFilesSha` :
    // c'est de l'état de TOUR, et un tour qui déborde d'un chunk doit type-checker
    // ce qu'il a édité AVANT la soft-deadline. Le chemin `completed` ne l'écrit pas
    // (le tour y est fini), donc le semis reste vide au premier chunk d'un tour.
    /** Ce que le modèle a vérifié lui-même sur ce chunk (MIN-262) — rempli par
     *  `run_command`, périmé par toute édition, lu par la porte de livraison.
     *  PARTAGÉ avec les filles, comme `editedPaths`. Il ne voyage PAS dans le
     *  checkpoint : un chunk qui reprend n'a rien vu passer vert lui-même. */

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
    /**
     * LA MÉMOIRE DE LA SESSION, RASSEMBLÉE ICI ET NULLE PART AILLEURS. Une
     * lecture par TOUR — la ligne du run, elle, est relue à chaque appel du
     * plan de contrôle, et c'est pour ça que le journal en est sorti.
     */
    const pointer = run.checkpoint?.opencode;
    const opencodeJournal = pointer?.sessionId
      ? {
          sessionId: pointer.sessionId,
          events: await loadRunJournal(run.id, pointer.sessionId),
          seq: pointer.seq ?? {},
        }
      : undefined;
    // `bootstrapMs` manque exprès : c'est `startVmLoop` qui le pose, parce que
    // c'est lui qui sait quand l'amorçage se termine (cf. `VmJob.bootstrapMs`).
    const job: Omit<VmJob, "bootstrapMs"> = {
      protocolVersion: VM_PROTOCOL_VERSION,
      /**
       * OÙ CE TOUR TRAVAILLE (MIN-354). Une microVM est créée pour un run et
       * pour lui seul : son layout est celui du cloud, sans autre choix à faire.
       * Ce qui change, c'est que le harness l'APPREND au lieu de le supposer —
       * et c'est ce qui permettra à un autre lanceur d'en poser un autre.
       */
      layout: cloudLayout(),
      runId: run.id,
      ledgerRunId: run.run_id ?? run.id,
      projectId: run.project_id,
      appOrigin: agentControlOrigin(),
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
        /**
         * UNE RELECTURE NE DÉLÈGUE PAS, et c'est ce plafond qui le dit sous
         * opencode : la config sert le tool `task` dès qu'il est > 0
         * ([opencode-config.ts](vm/opencode-config.ts), `primaryTools`). Les
         * deux prompts posent déjà la même condition (l.1308 et l.1442) — le
         * job, lui, l'avait perdue : le modèle recevait un tool de délégation
         * que son ancrage ne décrit pas et que `PR_REVIEW_TOOLS` refuse, et
         * une relecture pouvait ouvrir deux sessions filles qui ÉDITENT.
         */
        maxParallel: writesToRepo ? subagentMaxParallel : 0,
        allowedIds: subagentScope.allowedIds,
        abovePlanIds: subagentScope.abovePlanIds,
        maxMultiplier: subagentScope.maxMultiplier,
        ...(Object.keys(subagentPricing).length > 0 ? { pricing: subagentPricing } : {}),
      },
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
      /**
       * LE JOURNAL, RASSEMBLÉ DEPUIS SA TABLE (MIN-286, 2026-08-13). La ligne
       * du run n'en porte que le pointeur : les events vivent en append dans
       * `agent_run_journal`, parce qu'ils charrient la sortie complète de
       * chaque tool et qu'un checkpoint ne pouvait pas les tenir.
       */
      ...(opencodeJournal ? { opencode: opencodeJournal } : {}),
      opencodeInput,
      instructions,
      usageSeqStart,
      ...(budgetUsd !== undefined ? { budgetUsd } : {}),
      editedPaths: [...(run.checkpoint?.editedPaths ?? [])],
      repoTouched: run.checkpoint?.repoTouched === true,
      prInlineComments: run.checkpoint?.prInlineComments ?? 0,
      baseBranch,
      workBranch,
      // Un premier tour dont aucune branche n'a encore été stampée ne peut pas
      // exister sur le remote. Le harness peut alors partir directement de HEAD
      // au lieu de payer un `git fetch` voué à répondre « ref inexistante ».
      remoteWorkMayExist: run.branch_name != null || run.continuations > 0,
      /**
       * LA FONCTION NE SAIT PRODUIRE QU'UN CLONE (MIN-358). C'est elle qui a
       * créé la microVM et cloné dedans ; le mode `current` appartient à un
       * lanceur qui, lui, travaille dans un dépôt qui existait avant lui.
       */
      repoMode,
      /**
       * Une relecture ne commite RIEN : lui résoudre le bot de l'App coûterait un
       * appel de forge pour une identité que personne n'utilisera. Ailleurs c'est
       * le bot, mémoïsé par process (cf. `getGithubBotCommitIdentity`).
       */
      committer: prRun
        ? { name: "minddy agent", email: "agent@minddy.app" }
        : await committerPromise,
      // Le job PART dans la microVM : c'est `vmTarget`, jamais `target`
      // (MIN-327). La boucle n'en fait que du `git` — et une relecture n'en
      // reçoit qu'un token en lecture.
      authUrl: vmTarget.authUrl,
      commitRef,
      filesFromSha,
      locale: commentLocale,
      feature: usageFeature,
    };
    /**
     * LE TOUR PART SUR UNE MACHINE (MIN-293) — et la fonction s'arrête ici.
     *
     * Elle a fait tout son travail : le contexte, le modèle, le plafond, le bail
     * de dépense, la branche, l'identité de committer, l'URL de push. Ce qu'elle
     * ne peut pas faire, c'est écrire sur un disque qu'elle ne voit pas — donc
     * elle REND le job au lieu de le poser.
     *
     * **`layout` en est absent, et c'est l'invariant du lot** : le serveur
     * possède tout ce qui concerne le run, la machine possède tout ce qui
     * concerne le disque (cf. [lib/desktop/local-turn.ts](../../desktop/local-turn.ts)).
     * `bootstrapMs` aussi : il n'y a pas de microVM dont il faudrait facturer le
     * réveil.
     *
     * PAS DE `loop_command_id` : il n'y a aucune commande de plateforme à
     * interroger. Le chien de garde le sait depuis MIN-355 et donne à un run
     * local la borne des deux heures plutôt que celle des quinze minutes
     * (`reapDeadVmRuns`, drain.ts) — c'est la première des sept casses de
     * l'audit, et elle est réglée là-bas, pas ici.
     *
     * Le run reste `running` : il l'est. Ce qui le sortira de là, c'est son
     * rapport de fin de tour ou le chien de garde, exactement comme dans le cloud.
     */
    if (localTurn) {
      /**
       * ⚠ **`layout` EST RETIRÉ ICI, À LA MAIN, ET C'EST LE CŒUR DE L'AFFAIRE.**
       *
       * Le type de `onLocalAssignment` dit `Omit<VmJob, "layout" | "bootstrapMs">`,
       * et c'est **une fiction de compilateur** : l'objet ci-dessus porte bien un
       * `layout: cloudLayout()` à l'exécution, parce qu'il fallait bien en poser
       * un pour satisfaire `VmJob`. Envoyé tel quel, il donnait à la machine les
       * chemins `/vercel/sandbox` — c'est-à-dire un dossier qui n'existe pas
       * chez elle, et surtout un layout que le serveur n'a AUCUN moyen de
       * connaître.
       *
       * Le parseur de la coquille l'a refusé, et il a eu raison : `"layout" in
       * job` est chez lui un refus sec ([lib/desktop/local-turn.ts](../../desktop/local-turn.ts)),
       * précisément parce que `repoDir` est la racine de sécurité de toutes les
       * écritures du modèle et qu'elle ne se reçoit pas d'ailleurs.
       *
       * La leçon vaut d'être écrite : **un `Omit<>` sur une frontière réseau ne
       * retire rien.** Ce qui a rattrapé la faute, c'est la garde d'en face, pas
       * le type.
       */
      const { layout: _cloudLayout, ...assignment } = job;
      opts.onLocalAssignment?.(assignment, { repoFullName: target.repoFullName });
      // Le claim initial (ou le steer d'une reprise) a déjà rafraîchi l'activité.
      // On rejoint seulement l'event démarré au début : dans la pratique il est
      // terminé depuis longtemps, sans ajouter une nouvelle écriture SQL.
      await runningEvent;
      // Le drapeau de boucle partie n'est PAS posé ici : il dit « une microVM
      // tourne, et c'est la boucle qui la facturera ». Il n'y en a aucune, et la
      // garde `!sandbox` de `billSandboxCompute` — celle qui existait déjà —
      // suffit. Poser les deux donnerait deux raisons de ne pas facturer la même
      // chose, donc un jour deux raisons qui divergent.
      return "detached";
    }

    // `sandbox` et non `sb` : le compilateur sait qu'il est non nul ici, la
    // branche locale étant sortie juste au-dessus.
    if (!sandbox) throw new Error("no sandbox to start the loop in");
    const cmdId = await startVmLoop(sandbox, job, callStart);
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
      sandbox_id: sandboxName(sandbox),
      sandbox_stopped_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
      ...costFromLedger,
    });
    if (!retryForPending) await notifyAgentRun(run, "agent_failed");
    return "completed";
  } finally {
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
