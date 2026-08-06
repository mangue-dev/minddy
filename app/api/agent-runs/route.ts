import { NextResponse, type NextRequest } from "next/server";

import { isReasoningLevel } from "@/lib/agent-reasoning";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";

/**
 * Liste GLOBALE des sessions de l'agent de code (Numo), tous projets accessibles
 * confondus — alimente la page Agents. RLS `agent_runs` = can_access_project (et
 * créateur seul pour les runs carnet) → le cookie client suffit, aucun filtre
 * projet manuel.
 *
 * Une SESSION est scoppée à une ISSUE, mais une issue a PLUSIEURS runs successives
 * (MIN-68). On DÉDOUBLONNE donc par `issue_id` en gardant comme REPRÉSENTANT la
 * DERNIÈRE run en date, telle quelle : le badge de la sidebar reflète l'état de la
 * dernière session / dernière PR du ticket, sans maquillage. `runCount` expose la
 * profondeur de l'historique : la conversation de l'issue liste et rend
 * consultables les runs passées via son sélecteur de sessions. `working` signale
 * qu'un run de l'issue TRAVAILLE (queued/running) — pilote le spinner de la liste.
 *
 * Les runs SANS TICKET (MIN-84, issue_id null) sont chacun leur PROPRE session —
 * pas de dédoublonnage (aucune lignée) ; leur « titre » est l'excerpt de leur
 * instruction (`prompt`).
 *
 * POST = lancement d'un run sans ticket : { projectId, prompt, model?, baseBranch? }.
 */

export const runtime = "nodejs";
// Le kick de launch draine le premier chunk dans after() : même fenêtre que la
// route cron (270 s de budget) — même raison que le 300 de /api/issues/[id]/agent.
export const maxDuration = 300;

const WORKING_STATUSES = ["queued", "running"];

type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

interface RunRow {
  id: string;
  issue_id: string | null;
  pull_request_id: string | null;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: "button" | "chat" | "mention";
  prompt: string | null;
  title: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  awaiting_input: boolean;
  issue: { id: string; number: number; title: string } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    /** Lu pour ÉCARTER les sessions d'un projet à la corbeille — jamais rendu. */
    deleted_at: string | null;
  } | null;
  /** PR RELUE par ce run (MIN-168). Null partout ailleurs. */
  pull_request: { id: string; number: number; title: string | null; url: string | null } | null;
}

/** Cap de l'excerpt de note renvoyé comme titre d'une session carnet. */
const NOTE_EXCERPT_MAX = 200;

function noteExcerpt(prompt: string | null): string | null {
  if (!prompt?.trim()) return null;
  const trimmed = prompt.trim();
  return trimmed.length <= NOTE_EXCERPT_MAX ? trimmed : `${trimmed.slice(0, NOTE_EXCERPT_MAX)}…`;
}

export interface AgentSessionListItem {
  /** Run représentant de la session (pilote le détail / la conversation). */
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: RunRow["triggered_by"];
  /**
   * Le titre d'une session CARNET (issue null) : le résumé écrit au lancement par
   * le petit modèle, et à défaut l'excerpt de la note elle-même — un run lancé
   * avant `agent_runs.title`, ou dont la génération a échoué.
   */
  noteTitle: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: RunRow["pr_state"];
  created_at: string;
  updated_at: string;
  /** Null = session carnet (MIN-84) ou session de RELECTURE (MIN-168). */
  issue: RunRow["issue"];
  /**
   * La pull request que cette session RELIT (MIN-168) — non nul ⇒ badge
   * « Analyse de PR » et titre de la PR, là où une session de ticket montre son
   * identifiant. Ce n'est PAS la PR qu'un run de code aurait ouverte : celle-là
   * vit dans `pr_number` / `pr_url` / `pr_state`, et les deux ne se mélangent pas.
   */
  pullRequest: { id: string; number: number; title: string | null; url: string | null } | null;
  project: { id: string; key: string; name: string; icon_url: string | null } | null;
  /** Un run de l'issue TRAVAILLE (queued/running) → « Numo travaille ». */
  working: boolean;
  /** Nombre total de runs de l'issue (≥ 1) → accès à l'historique (MIN-68). */
  runCount: number;
  /**
   * Dernière fin d'agent de la session (max `completed_at` de ses runs), ou `null`.
   * Comparé au `last_read_at` de l'utilisateur → bulle bleue « terminé, non lu ».
   */
  lastCompletedAt: string | null;
  /**
   * La DERNIÈRE run de la session attend une réponse de l'utilisateur (tour
   * terminé sur ask_user) → point JAUNE au lieu du bleu, mêmes règles de lecture.
   */
  awaitingInput: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_runs")
    .select(
      "id, issue_id, pull_request_id, status, model, triggered_by, prompt, title, pr_number, pr_url, pr_state, created_at, updated_at, completed_at, awaiting_input, issue:issues(id, number, title), project:projects(id, key, name, icon_url, deleted_at), pull_request:pull_requests(id, number, title, url)",
    )
    // Un passage de ROUTINE (MIN-185) n'est PAS une conversation : il vit dans
    // sa routine, sous « Exécutions précédentes », et nulle part ailleurs. Sans
    // ce filtre, une routine quotidienne noierait cette colonne en une semaine.
    .is("routine_id", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Un run dont l'issue est à la corbeille (MIN-133) : `issue_id` est renseigné
  // mais la ressource imbriquée revient nulle, la policy `issues_select` l'ayant
  // écartée. Le laisser passer le ferait lire comme une session CARNET — même
  // forme (issue nulle), titre de repli compris — pour un ticket qui n'existe
  // plus à l'écran. Restaurer le ticket ramène sa session telle quelle.
  // Même raisonnement pour une session de RELECTURE dont la PR n'est plus
  // lisible (dépôt délié depuis) : sans elle, la session n'a plus ni titre ni
  // badge et se lirait comme une session carnet, pour une PR qui n'est plus là.
  // Même raisonnement, un cran plus haut, pour un PROJET à la corbeille : sa
  // ligne reste en base et la policy `projects_select` ne regarde que l'accès, si
  // bien que ses sessions revenaient dans la liste — sous un en-tête portant le
  // nom d'un projet que l'utilisateur ne voit plus nulle part ailleurs. Le
  // restaurer les ramène, comme le reste de son contenu.
  const rows = ((data ?? []) as unknown as RunRow[]).filter(
    (r) =>
      (r.issue_id === null || r.issue !== null) &&
      (r.pull_request_id === null || r.pull_request !== null) &&
      !r.project?.deleted_at,
  );
  // Les lignes arrivent triées par created_at DESC : le 1er run vu par issue est la
  // DERNIÈRE session en date — c'est elle le représentant (badge fidèle à l'état de
  // la dernière session/PR ; ses `pr_*` portent déjà la PR héritée du ticket, même
  // si le run a échoué à l'amorçage). `working` = un run quelconque de l'issue
  // travaille. Un run CARNET (issue_id null) est sa propre session : clé par run —
  // sans quoi toutes les sessions carnet fusionneraient sous la clé null.
  // Une session de RELECTURE (MIN-168) est sa propre session, comme un run
  // carnet : elle n'a pas de lignée, et deux relectures successives de la même PR
  // sont deux conversations distinctes — la première a déjà commenté, la seconde
  // relit un autre diff. La clé est donc le run, pas la PR.
  const byIssue = new Map<string, AgentSessionListItem>();
  for (const r of rows) {
    const sessionKey = r.issue_id ?? `run:${r.id}`;
    const existing = byIssue.get(sessionKey);
    const isWorking = WORKING_STATUSES.includes(r.status);
    if (!existing) {
      byIssue.set(sessionKey, {
        runId: r.id,
        status: r.status,
        model: r.model,
        triggered_by: r.triggered_by,
        // Le titre d'une session sans ticket : celui de la PR pour une
        // relecture, sinon le résumé de la note (à défaut, son excerpt).
        noteTitle: r.issue_id
          ? null
          : r.pull_request?.title?.trim() ||
            r.title?.trim() ||
            noteExcerpt(r.prompt),
        pr_number: r.pr_number,
        pr_url: r.pr_url,
        pr_state: r.pr_state,
        created_at: r.created_at,
        updated_at: r.updated_at,
        issue: r.issue,
        pullRequest: r.pull_request,
        // Sans son `deleted_at`, qui n'a servi qu'au filtre ci-dessus : la
        // réponse ne porte que ce que la liste peint.
        project: r.project
          ? {
              id: r.project.id,
              key: r.project.key,
              name: r.project.name,
              icon_url: r.project.icon_url,
            }
          : null,
        working: isWorking,
        runCount: 1,
        lastCompletedAt: r.completed_at,
        // Seul le REPRÉSENTANT (dernière run) compte : une vieille run restée
        // en attente est dépassée par la lignée.
        awaitingInput: r.status === "completed" && r.awaiting_input,
      });
      continue;
    }
    existing.runCount++;
    // Un run plus ancien peut toujours porter l'info « travaille » de l'issue.
    if (isWorking) existing.working = true;
    // Dernière fin d'agent de l'issue = la plus tardive parmi ses runs terminées.
    if (r.completed_at && (!existing.lastCompletedAt || r.completed_at > existing.lastCompletedAt)) {
      existing.lastCompletedAt = r.completed_at;
    }
  }

  // Ordre STABLE par date de création (la plus récente en haut) : contrairement à
  // updated_at (bougé par les synchros PR / webhooks), created_at ne change pas →
  // la liste ne se réordonne pas toute seule.
  const sessions = [...byIssue.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
  return NextResponse.json({ sessions });
}

// Bornes du POST carnet : la note est un texte libre (persistée en `prompt` du
// run), le modèle et la branche des identifiants courts.
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const MAX_BRANCH_LENGTH = 255;

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  noModelForProvider: 400,
  modelAbovePlan: 403,
  promptRequired: 400,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  const status = LAUNCH_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json(
    {
      error: result.error,
      code: result.error,
      run: result.run,
      quota: result.quota,
      modelLimit: result.modelLimit,
    },
    { status },
  );
}

/**
 * Lance un run SANS TICKET (MIN-84, dit « carnet » — le carnet en fut le
 * premier point d'entrée) : ancré à un projet (le dépôt à cloner) + un texte
 * libre comme instruction, quel qu'en soit le sujet. Membre du projet requis —
 * le run est ensuite personnel (RLS : créateur seul).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: {
    projectId?: string;
    prompt?: string;
    model?: string;
    reasoningLevel?: string;
    baseBranch?: string;
  };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH) : "";
  // Un uuid fait 36 caractères : au-delà de la marge, corps forgé.
  if (!projectId || projectId.length > 64) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json(
      { error: "promptRequired", code: "promptRequired" },
      { status: 400 },
    );
  }

  const access = await getProjectAccess(auth.user.id, projectId);
  if (!access?.isMember) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, MAX_MODEL_LENGTH)
      : undefined;
  const baseBranch =
    typeof body.baseBranch === "string" && body.baseBranch.trim()
      ? body.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : undefined;
  // Niveau de raisonnement du composer (MIN-122). Une valeur inconnue est
  // IGNORÉE plutôt que refusée : le lancement retombe alors sur le défaut perso,
  // comme la route d'un ticket.
  const reasoningLevel = isReasoningLevel(body.reasoningLevel)
    ? body.reasoningLevel
    : undefined;

  const result = await launchAgentRun({
    projectId,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt,
    model,
    forced: !!model,
    reasoningLevel,
    baseBranch,
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
