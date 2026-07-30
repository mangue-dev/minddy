import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { insertNotifications } from "@/lib/server/notifications";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { AgentChatMessage, AgentEventType } from "./agent-loop";
import type { SubagentRecord } from "./subagent";
import { broadcastRunEvent } from "./live";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";

/**
 * Accès données des runs de l'agent de code (MIN-46) : création, claim CAS,
 * stamping terminal-gardé, sweeper des runs bloqués, et append des events du
 * live view. Service client uniquement (RLS lecture-seule côté membres).
 */

/**
 * Statuts d'un run (modèle conversationnel). `completed` = AU REPOS : le tour est
 * fini, la session attend le prochain message dans sa conversation — elle reste
 * reprennable à chaud et n'occupe PLUS le ticket. (`needs_input` n'existe plus :
 * une question de l'agent est une réponse comme une autre.)
 */
export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** Statuts dont on ne repart pas — ceux qui closent un run (analytics). */
const TERMINAL_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "completed",
  "failed",
  "canceled",
]);

/** Contenu sérialisé du checkpoint (repris tel quel au chunk suivant). */
export interface AgentCheckpoint {
  messages: AgentChatMessage[];
  /** Prochain index de ligne ai_usage (ordre d'affichage). */
  usageSeq?: number;
  /**
   * Sha git au dernier event `files_changed` émis — le « avant » du diff par tour
   * (MIN-46). Persisté dans le checkpoint pour qu'un tour éclaté sur plusieurs chunks
   * (WIP intermédiaires) diffe quand même depuis son VRAI début, pas depuis le dernier
   * chunk. Amorcé au HEAD du premier chunk (« rien de changé encore » pour ce run).
   */
  lastFilesSha?: string;
  /**
   * Instructions repo déjà servies au modèle (MIN-115) : chemins vus (racine à
   * l'amorce, sous-dossiers à la première édition dedans) et octets consommés sur
   * le cap global. Persisté pour qu'un tour éclaté sur plusieurs chunks ne
   * re-serve jamais un `AGENTS.md` que le modèle a déjà lu.
   */
  instructions?: { paths: string[]; bytes: number };
  /**
   * Sous-agents de ce run (MIN-112), records sérialisés — rapport capé à
   * `SUBAGENT_RECORD_REPORT_MAX_CHARS`. C'est ce qui permet à `agent_status` et
   * `list_agents` de répondre HONNÊTEMENT après un suspend, au lieu de dire
   * « inconnu » sur un sous-agent que l'agent vient de lancer. Un record restauré
   * n'est plus rattaché à rien (une promesse ne survit pas à la fin d'une fonction
   * Vercel) : `Subagents.restore` le déclare coupé et déjà livré.
   */
  subagents?: SubagentRecord[];
  /**
   * Le tour est GARÉ en attente de ses sous-agents (MIN-112) : le parent a déjà
   * répondu, une fille suspendue reprendra au chunk suivant. Sans ce drapeau, le
   * chunk repris ferait parler le modèle pour rien — un aller-retour payant par
   * chunk d'attente, juste pour lui faire redire qu'il attend.
   */
  parkedForSubagents?: boolean;
}

export interface AgentRun {
  id: string;
  project_id: string;
  /** Null = run « carnet » (MIN-84) : ancré au projet + une instruction libre,
   *  sans ticket. Aucune lignée : chaque run carnet est sa propre conversation. */
  issue_id: string | null;
  repo_link_id: string | null;
  connection_id: string | null;
  status: AgentRunStatus;
  triggered_by: "button" | "chat" | "mention";
  created_by: string | null;
  prompt: string | null;
  model: string | null;
  model_forced: boolean;
  /** Niveau de raisonnement FIGÉ au lancement (MIN-122), comme le modèle : un run
   *  repris par une autre invocation doit retrouver le même. */
  reasoning_level: ReasoningLevel;
  key_mode: "platform" | "byok";
  base_branch: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  sandbox_id: string | null;
  checkpoint: AgentCheckpoint | null;
  continuations: number;
  attempts: number;
  not_before: string;
  started_at: string | null;
  window_started_at: string | null;
  run_id: string | null;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  /** Le dernier tour s'est terminé sur un ask_user : la session attend la réponse
   *  de l'utilisateur (point jaune sur les surfaces). Remis à false à chaque
   *  autre entrée au repos. */
  awaiting_input: boolean;
  /** Horloge d'inactivité : heartbeat client + steer + entrée au repos. Pilote le
   *  reaping de la sandbox idle. */
  last_activity_at: string;
  /** « Interrompre la réponse en cours » : lu par le chunk actif qui suspend. */
  interrupt_requested: boolean;
  /** microVM coupée par le reaper (null = vivante/inconnue). */
  sandbox_stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES: AgentRunStatus[] = ["queued", "running"];
/**
 * Un run 'running' plus vieux que ce seuil est présumé bloqué (fonction morte).
 *
 * DOIT rester au-dessus de la durée d'un chunk SAIN, sinon le sweeper vole un run
 * en pleine exécution : deux fonctions travailleraient alors sur la même sandbox,
 * et le second checkpoint écraserait le premier. Depuis que le cron tourne en
 * fonctions de 800 s (Fluid, plan Pro), un chunk sain va jusqu'à ~13 min — d'où 20,
 * qui garde une marge nette tout en récupérant un vrai crash bien avant qu'un
 * humain ne s'en aperçoive.
 */
const STUCK_RUNNING_MS = 20 * 60_000;
const MAX_CRASH_ATTEMPTS = 2;

export interface CreateRunInput {
  projectId: string;
  /** Null = run carnet (MIN-84), sans ticket. */
  issueId: string | null;
  repoLinkId: string | null;
  connectionId: string | null;
  createdBy: string;
  prompt?: string | null;
  model: string;
  modelForced: boolean;
  /** Niveau de raisonnement résolu au lancement (cf. `resolveReasoningLevel`). */
  reasoningLevel: ReasoningLevel;
  keyMode: "platform" | "byok";
  triggeredBy: "button" | "chat" | "mention";
  /**
   * Branche à reprendre (au lieu d'en générer une neuve) : une run froide qui
   * hérite de la PR de l'issue repart de SA branche → même PR mise à jour (MIN-68).
   */
  baseBranch?: string | null;
  branchName?: string | null;
  /** PR héritée, posée dès la création (cf. `inheritableWorkForIssue`). */
  prNumber?: number | null;
  prUrl?: string | null;
  prState?: AgentRun["pr_state"];
}

/**
 * Levée par `createRun` quand l'index unique `idx_agent_runs_active_issue` refuse
 * l'insertion : une autre run de l'issue est devenue active entre le pré-check et
 * l'INSERT. C'est le même refus que le garde applicatif, gagné par la base.
 */
export class ActiveRunExistsError extends Error {
  constructor() {
    super("An agent run is already active on this issue");
    this.name = "ActiveRunExistsError";
  }
}

/** Code Postgres d'une violation de contrainte d'unicité. */
const PG_UNIQUE_VIOLATION = "23505";

/** Crée un run en `queued`, prêt à être drainé. */
export async function createRun(input: CreateRunInput): Promise<AgentRun> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_runs")
    .insert({
      project_id: input.projectId,
      issue_id: input.issueId,
      repo_link_id: input.repoLinkId,
      connection_id: input.connectionId,
      status: "queued",
      triggered_by: input.triggeredBy,
      created_by: input.createdBy,
      prompt: input.prompt ?? null,
      model: input.model,
      model_forced: input.modelForced,
      reasoning_level: input.reasoningLevel,
      key_mode: input.keyMode,
      base_branch: input.baseBranch ?? null,
      branch_name: input.branchName ?? null,
      pr_number: input.prNumber ?? null,
      pr_url: input.prUrl ?? null,
      pr_state: input.prState ?? null,
      run_id: randomUUID(),
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) throw new ActiveRunExistsError();
    throw new Error(error?.message ?? "Failed to create agent run");
  }
  // Analytics (MIN-78) : le lancement est aussi tracké côté client, mais lui
  // seul ne voit pas les runs déclenchés par mention ou relancés par le drain.
  // Le prompt n'est jamais envoyé.
  captureServerEvent({
    distinctId: input.createdBy ?? "agent:system",
    event: "agent_run_started",
    properties: {
      model: input.model ?? "default",
      model_forced: input.modelForced,
      reasoning_level: input.reasoningLevel,
      key_mode: input.keyMode,
      triggered_by: input.triggeredBy,
      scope: input.issueId ? "issue" : "notebook",
      has_base_branch: !!input.baseBranch,
      resumes_pr: input.prNumber != null,
      project_id: input.projectId,
    },
    groups: { project: input.projectId },
  });
  return data as AgentRun;
}

/** Claim CAS atomique (queued → running). Renvoie null si un autre l'a pris. */
export async function claimRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("claim_agent_run", { p_run_id: runId });
  if (error) {
    console.error("[agent-runs] claim failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as AgentRun[];
  return rows[0] ?? null;
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service.from("agent_runs").select("*").eq("id", runId).maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * Run ACTIF (queued/running — l'agent TRAVAILLE) de l'issue, ou null. Au repos
 * (`completed`), une session n'occupe plus le ticket. L'index partiel unique
 * `idx_agent_runs_active_issue` en garantit au plus un — le tri + `limit(1)`
 * reste un garde-fou (des données antérieures peuvent en avoir plusieurs, et
 * `maybeSingle` lèverait au lieu de répondre).
 */
export async function activeRunForIssue(issueId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("issue_id", issueId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * Une run PLUS RÉCENTE que `createdAt` existe-t-elle sur l'issue ? Les runs d'une
 * issue partagent la branche : dès qu'une plus récente existe, la précédente n'est
 * plus reprennable (sa sandbox est restée sur un ancêtre — son push serait rejeté).
 * Elle devient un historique consultable.
 *
 * Les runs `failed` sont IGNORÉES : une run morte à l'amorçage n'a jamais acquis de
 * sandbox ni fait avancer la branche — la compter condamnerait définitivement la
 * dernière bonne session (409 supersededRun) pour une panne transitoire (mint de
 * token GitHub, 502…) survenue en essayant d'en lancer une nouvelle.
 */
export async function newerRunExistsForIssue(
  issueId: string,
  createdAt: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("id")
    .eq("issue_id", issueId)
    .gt("created_at", createdAt)
    .neq("status", "failed")
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Travail de l'issue dont une run froide peut hériter (cf. `inheritableWorkForIssue`). */
export interface InheritableWork {
  branchName: string;
  baseBranch: string | null;
  /** PR de la lignée, si une a été ouverte (la création de PR est optionnelle). */
  prNumber: number | null;
  prUrl: string | null;
  prState: AgentRun["pr_state"];
}

/**
 * TRAVAIL dont une NOUVELLE run froide doit hériter (MIN-68, généralisé au modèle
 * conversationnel) : la lignée est indexée sur la BRANCHE, plus seulement sur la
 * PR — depuis que `create_pr` est une décision, une session peut pousser du vrai
 * travail sans jamais ouvrir de PR, et ce travail ne doit pas être orphelin. On
 * prend la run la plus récente qui porte une branche :
 *   • PR `open` / `draft`  → même branche, on itère sur la PR ;
 *   • PR `closed` (refusée) → même branche, la PR sera rouverte au prochain push ;
 *   • pas de PR             → même branche (le travail poussé continue) ;
 *   • PR `merged`           → livrée : plus rien à itérer, la run repart d'une
 *                             branche neuve (→ null ici).
 * Null aussi si aucune run n'a jamais eu de branche (premier lancement).
 */
export async function inheritableWorkForIssue(issueId: string): Promise<InheritableWork | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("branch_name, base_branch, pr_number, pr_url, pr_state")
    .eq("issue_id", issueId)
    .not("branch_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as {
    branch_name: string | null;
    base_branch: string | null;
    pr_number: number | null;
    pr_url: string | null;
    pr_state: AgentRun["pr_state"];
  } | null;
  if (!row?.branch_name) return null;
  if (row.pr_state === "merged") return null;
  return {
    branchName: row.branch_name,
    baseBranch: row.base_branch,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prState: row.pr_state,
  };
}

/**
 * Une run PLUS ANCIENNE de l'issue a-t-elle déjà travaillé cette branche ?
 * Distingue, à l'amorce d'une run sans checkpoint, une branche HÉRITÉE (elle porte
 * le travail d'une session précédente → message d'héritage) de la branche NEUVE
 * d'un premier chunk re-tenté après crash (générée puis stampée par le chunk mort,
 * sans aucun passé — un message d'héritage y serait mensonger).
 */
export async function branchHasPriorRun(
  issueId: string,
  branchName: string,
  beforeCreatedAt: string,
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("id")
    .eq("issue_id", issueId)
    .eq("branch_name", branchName)
    .lt("created_at", beforeCreatedAt)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/**
 * Résumé de la run précédente de l'issue (son `outcome` = la DERNIÈRE RÉPONSE de
 * l'agent, capée). Injecté dans le prompt d'AMORCE d'une run froide : elle n'hérite
 * d'aucun checkpoint, ce résumé est son seul lien avec ce qui a été fait avant.
 * Exclut la run courante. Restreint aux runs `completed` avec un `outcome`.
 */
export async function previousRunSummaryForIssue(
  issueId: string,
  excludeRunId: string,
): Promise<string | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("outcome")
    .eq("issue_id", issueId)
    .neq("id", excludeRunId)
    .eq("status", "completed")
    .not("outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const outcome = (data as { outcome?: string | null } | null)?.outcome ?? null;
  return outcome?.trim() ? outcome.trim() : null;
}

export interface StampFields {
  status?: AgentRunStatus;
  checkpoint?: AgentCheckpoint | null;
  continuations?: number;
  attempts?: number;
  not_before?: string;
  sandbox_id?: string | null;
  base_branch?: string | null;
  branch_name?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: AgentRun["pr_state"];
  cost_usd?: number;
  outcome?: string | null;
  error_message?: string | null;
  window_started_at?: string | null;
  last_activity_at?: string;
  interrupt_requested?: boolean;
  sandbox_stopped_at?: string | null;
  awaiting_input?: boolean;
}

/**
 * Met à jour un run en gardant la transition (`.in('status', guard)`, défaut
 * ['running']) : un run annulé/déjà terminé n'est jamais réécrit par un chunk en
 * retard. Renvoie le run mis à jour, ou null si la garde n'a pas matché.
 *
 * Null couvre aussi l'échec : notamment une violation de
 * `idx_agent_runs_active_issue` (réveiller un run alors qu'un autre est devenu actif
 * — cf. la route /steer). On la trace au lieu de l'avaler en silence : un appelant
 * qui ignore le null croirait le run relancé alors qu'il ne le sera jamais.
 */
export async function stampRun(
  runId: string,
  fields: StampFields,
  opts?: { guard?: AgentRunStatus[] },
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const guard = opts?.guard ?? ["running"];
  const { data, error } = await service
    .from("agent_runs")
    .update(fields)
    .eq("id", runId)
    .in("status", guard)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(
      `[agent-runs] stampRun ${runId} → ${fields.status ?? "(fields)"} failed:`,
      error.message,
    );
  }

  // Fin de run (MIN-78). Tracké ici et non dans la boucle d'exécution : c'est
  // le passage OBLIGÉ vers un statut terminal, et le `.in(status, guard)`
  // garantit qu'une seule mise à jour gagne — donc un seul événement par run,
  // même si plusieurs chunks tentent de conclure.
  const run = (data as AgentRun | null) ?? null;
  if (run && TERMINAL_RUN_STATUSES.has(run.status)) {
    captureServerEvent({
      distinctId: run.created_by ?? "agent:system",
      event: run.status === "completed" ? "agent_run_completed" : "agent_run_failed",
      properties: {
        status: run.status,
        model: run.model ?? "default",
        key_mode: run.key_mode,
        triggered_by: run.triggered_by,
        scope: run.issue_id ? "issue" : "notebook",
        opened_pr: run.pr_number != null,
        duration_bucket: run.created_at
          ? durationBucket(Date.now() - Date.parse(run.created_at))
          : "unknown",
        project_id: run.project_id,
      },
      groups: { project: run.project_id },
    });
  }
  return run;
}

/**
 * Inbox (MIN-82) : prévient le LANCEUR du run — question posée, tour terminé,
 * échec. C'est le seul endroit où « se notifier soi-même » est voulu : l'acteur
 * est l'agent, pas l'utilisateur. `replaceUnread` garde au plus une
 * notification agent non lue par ticket (une longue session n'empile pas un
 * « terminé » par tour). Best-effort — ne casse jamais le run.
 */
export async function notifyAgentRun(
  run: {
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
  },
  type: "agent_done" | "agent_question" | "agent_failed",
): Promise<void> {
  // Run carnet (issue_id null) : pas de cible où renvoyer — pas de notification.
  if (!run.created_by || !run.issue_id) return;
  try {
    await insertNotifications(
      getServiceClient(),
      [
        {
          user_id: run.created_by,
          project_id: run.project_id,
          type,
          issue_id: run.issue_id,
          actor_id: null,
        },
      ],
      { replaceUnread: true },
    );
  } catch (e) {
    console.error("[agent-runs] notify failed:", (e as Error).message);
  }
}

/**
 * Récupère les runs `running` bloqués (fonction morte : started_at trop vieux) :
 * requeue tant qu'il reste des tentatives, sinon échoue. À appeler en tête de
 * chaque drain (filet ultime, comme AutoKap).
 */
export async function requeueStuckRuns(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_RUNNING_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select("id, attempts, created_by, project_id, issue_id")
    .eq("status", "running")
    .lt("started_at", cutoff);
  const rows = (data ?? []) as Array<{
    id: string;
    attempts: number;
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
  }>;
  for (const row of rows) {
    if (row.attempts < MAX_CRASH_ATTEMPTS) {
      await service
        .from("agent_runs")
        .update({ status: "queued", not_before: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "running");
    } else {
      await service
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: "Agent run stuck (exceeded max attempts)",
          checkpoint: null,
        })
        .eq("id", row.id)
        .eq("status", "running");
      await notifyAgentRun(row, "agent_failed");
    }
  }
}

/** Run affecté par une synchro PR (pour aligner le statut d'issue côté appelant).
    `issueId` null = run carnet : aucune issue à aligner. */
export interface SyncedPrRun {
  id: string;
  issueId: string | null;
  createdBy: string | null;
}

/** Ids des liaisons projet↔dépôt pour `repoFullName` (un numéro de PR est unique
    par dépôt ; plusieurs projets peuvent lier le même dépôt). Filtré par
    PROVIDER (MIN-69) : `owner/name` n'est unique QUE par forge — sans ce filtre,
    un webhook GitLab pour `acme/app` tamponnerait les runs d'un dépôt GitHub
    homonyme (miroirs, forks migrés), et réciproquement. */
async function repoLinkIds(
  service: ReturnType<typeof getServiceClient>,
  repoFullName: string,
  provider: RepoProviderId,
): Promise<string[]> {
  const { data: links } = await service
    .from("project_git_links")
    .select("id")
    .eq("repo_full_name", repoFullName)
    .eq("provider", provider);
  return ((links ?? []) as Array<{ id: string }>).map((l) => l.id);
}

/**
 * Runs ayant ouvert la PR `prNumber` sur le dépôt `repoFullName` (lecture seule,
 * sans toucher à l'état PR). Utilisé par le webhook des reviews GitHub, qui doit
 * retrouver l'issue liée sans modifier le cycle draft/open/merged/closed.
 */
export async function findRunsForPr(opts: {
  repoFullName: string;
  prNumber: number;
  provider: RepoProviderId;
}): Promise<SyncedPrRun[]> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return [];
  const { data: runs } = await service
    .from("agent_runs")
    .select("id, issue_id, created_by")
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
  return ((runs ?? []) as Array<{ id: string; issue_id: string | null; created_by: string | null }>).map(
    (r) => ({ id: r.id, issueId: r.issue_id, createdBy: r.created_by }),
  );
}

/**
 * Synchronise l'état PR des runs qui ont ouvert la PR `prNumber` sur le dépôt
 * `repoFullName` (appelé par le webhook GitHub). Best-effort. Renvoie les runs
 * touchés pour que l'appelant aligne le statut de leur issue (in_review / done /
 * canceled).
 */
export async function syncPrState(opts: {
  repoFullName: string;
  prNumber: number;
  prState: AgentRun["pr_state"];
  prUrl?: string | null;
  provider: RepoProviderId;
}): Promise<SyncedPrRun[]> {
  const service = getServiceClient();
  const linkIds = await repoLinkIds(service, opts.repoFullName, opts.provider);
  if (linkIds.length === 0) return [];
  const { data: runs } = await service
    .from("agent_runs")
    .select("id, issue_id, created_by")
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
  const update: Record<string, unknown> = { pr_state: opts.prState };
  if (opts.prUrl) update.pr_url = opts.prUrl;
  await service
    .from("agent_runs")
    .update(update)
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
  return ((runs ?? []) as Array<{ id: string; issue_id: string | null; created_by: string | null }>).map(
    (r) => ({ id: r.id, issueId: r.issue_id, createdBy: r.created_by }),
  );
}

/**
 * Ajoute un message utilisateur à la file de steering d'un run (drainé par la
 * boucle à la frontière de round). Service client — l'endpoint authentifie avant.
 */
export async function insertRunMessage(
  runId: string,
  userId: string | null,
  content: string,
): Promise<void> {
  const service = getServiceClient();
  await service
    .from("agent_run_messages")
    .insert({ run_id: runId, created_by: userId, content });
}

/**
 * Draine (atomiquement) les messages de steering non consommés d'un run : les
 * marque consommés et renvoie leur contenu, ordre chronologique. Appelé au SOMMET
 * de chaque round de la boucle. Un run n'a qu'UN écrivain à la fois (le claimer).
 */
export async function pullPendingMessages(runId: string): Promise<string[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_run_messages")
    .update({ consumed_at: new Date().toISOString() })
    .eq("run_id", runId)
    .is("consumed_at", null)
    .select("content, created_at");
  if (error || !data) return [];
  return (data as Array<{ content: string; created_at: string }>)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => r.content);
}

/**
 * Rafraîchit l'horloge d'inactivité du run (heartbeat client, steer, entrée au
 * repos). Best-effort. Empêche le reaper de couper la sandbox pendant l'usage.
 */
export async function bumpRunActivity(runId: string): Promise<void> {
  try {
    const service = getServiceClient();
    await service
      .from("agent_runs")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", runId);
  } catch (err) {
    console.error("[agent-runs] bumpRunActivity failed:", (err as Error).message);
  }
}

/**
 * Demande l'interruption de la réponse en cours (« Stop »). Ne pose le drapeau que
 * sur un run qui TRAVAILLE (queued/running) — le chunk actif le lit et suspend
 * proprement au repos. N'annule rien, ne touche ni checkpoint ni sandbox.
 */
export async function requestInterrupt(runId: string): Promise<void> {
  const service = getServiceClient();
  await service
    .from("agent_runs")
    .update({ interrupt_requested: true })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
}

/** Lit le drapeau d'interruption (poll par la boucle : frontière de round + stream). */
export async function readInterruptFlag(runId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("interrupt_requested")
    .eq("id", runId)
    .maybeSingle();
  return Boolean((data as { interrupt_requested?: boolean } | null)?.interrupt_requested);
}

/** Réinitialise le drapeau d'interruption (une fois consommé par l'exécuteur). */
export async function clearInterrupt(runId: string): Promise<void> {
  const service = getServiceClient();
  await service
    .from("agent_runs")
    .update({ interrupt_requested: false })
    .eq("id", runId);
}

/**
 * Reste-t-il des messages de steering NON consommés ? Sert à décider, en fin de
 * tour, s'il faut RE-QUEUER (un message arrivé pendant la phase de finalisation,
 * après la dernière frontière de round, ne serait sinon traité qu'à l'action
 * utilisateur suivante).
 */
export async function hasPendingRunMessages(runId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_run_messages")
    .select("id")
    .eq("run_id", runId)
    .is("consumed_at", null)
    .limit(1);
  return ((data ?? []) as unknown[]).length > 0;
}

/** Violation d'unicité Postgres — ici, `idx_agent_run_events_run_seq`. */
const UNIQUE_VIOLATION = "23505";
/**
 * Recalculs de `seq` sur collision. Deux émetteurs (le parent et un sous-agent,
 * MIN-112) peuvent lire le même max(seq) et tenter le même numéro : le perdant
 * recalcule. Trois reprises couvrent largement le parallélisme réel (au plus
 * quelques sous-agents), et le compteur ne peut que MONTER — chaque tour de boucle
 * relit un max déjà avancé par le gagnant.
 */
const APPEND_EVENT_MAX_ATTEMPTS = 4;

/**
 * Ajoute un event au flux du live view (seq monotone par run). Best-effort : le
 * suivi ne doit jamais faire échouer le run.
 *
 * `seq` se calcule en LISANT le max puis en insérant, et `idx_agent_run_events_run_seq`
 * est UNIQUE. C'était sûr tant que la boucle émettait en série ; depuis les
 * sous-agents (MIN-112), une fille émet EN MÊME TEMPS que son parent — même max lu,
 * même `seq` tenté, insert refusé, event AVALÉ (le code loguait et rendait la main).
 * D'où la reprise sur violation d'unicité. Le second garde-fou est chez l'appelant :
 * `execute.ts` sérialise les emits d'un chunk derrière une chaîne de promesses, pour
 * que l'ORDRE du fil reste celui des faits — cette reprise-ci ne garantit que de ne
 * rien PERDRE, pas l'ordre.
 *
 * La ligne insérée est aussi DIFFUSÉE sur le topic du run (lib/server/agent/live)
 * : le fil ouvert l'affiche à l'instant plutôt qu'au prochain poll. Le `returning`
 * de l'insert la donne sans aller-retour supplémentaire.
 */
export async function appendEvent(
  runId: string,
  type: AgentEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const service = getServiceClient();
    for (let attempt = 0; attempt < APPEND_EVENT_MAX_ATTEMPTS; attempt++) {
      const { data } = await service
        .from("agent_run_events")
        .select("seq")
        .eq("run_id", runId)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSeq = ((data as { seq: number } | null)?.seq ?? -1) + 1;
      // supabase-js ne LÈVE pas sur un insert refusé (contrainte CHECK, RLS…) — il
      // renvoie { error }. Sans ce log, un type d'event non déclaré dans le CHECK
      // de agent_run_events disparaît en silence total (vécu sur `question`, MIN-86).
      const { data: row, error } = await service
        .from("agent_run_events")
        .insert({ run_id: runId, seq: nextSeq, type, payload })
        .select("id, seq, type, payload, created_at")
        .single();
      if (error) {
        // `seq` déjà pris par un autre émetteur : on relit le max et on retente.
        // Tout autre refus (CHECK sur `type`, RLS) est définitif — le retenter
        // à l'identique redonnerait la même erreur.
        if (
          (error as { code?: string }).code === UNIQUE_VIOLATION &&
          attempt < APPEND_EVENT_MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        console.error(`[agent-runs] appendEvent(${type}) rejected:`, error.message);
        return;
      }
      if (row) {
        broadcastRunEvent(runId, row as Parameters<typeof broadcastRunEvent>[1]);
      }
      return;
    }
  } catch (err) {
    console.error("[agent-runs] appendEvent failed:", (err as Error).message);
  }
}
