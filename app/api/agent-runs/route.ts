import { NextResponse, type NextRequest } from "next/server";

import { isReasoningLevel } from "@/lib/agent-reasoning";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { parseResourcesInput } from "@/lib/server/attachments";
import { promptWithAttachments } from "@/lib/server/agent/prompt-attachments";
import type { AttachmentInput } from "@/lib/types";

/**
 * Liste GLOBALE des conversations de l'agent de code (Numo), tous projets
 * accessibles confondus — alimente la page Agents. RLS `agent_runs` =
 * can_access_project (et créateur seul pour les runs carnet) → le cookie client
 * suffit, aucun filtre projet manuel.
 *
 * **UN RUN = UNE CONVERSATION**, sans exception. Les runs successifs d'un même
 * ticket étaient dédoublonnés ici et rangés derrière un sélecteur, au milieu de
 * l'en-tête de la conversation : la colonne montrait UNE ligne par ticket, et les
 * autres échanges se trouvaient en dépliant un menu que rien n'annonçait. Ils
 * paraissent désormais côte à côte, chacun sous son propre titre — celui que le
 * titreur a écrit au lancement (`agent_runs.title`), rendu à l'écran précédé de
 * l'identifiant du ticket.
 *
 * `working` dit que CE run travaille (queued/running) — le spinner de la ligne ;
 * `lastCompletedAt` est sa fin à lui, comparée au curseur de lecture du TICKET
 * (les états lus restent indexés par ticket : deux conversations du même ticket
 * se vident donc ensemble).
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
  conversation_id: string;
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
  conversation: { title: string | null; visibility: "private" | "project" } | null;
  issue: { id: string; number: number; title: string } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
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
  /** Identite durable de la conversation, distincte de son execution courante. */
  conversationId: string;
  /** Execution courante. Conserve pour les routes du moteur pendant la migration. */
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: RunRow["triggered_by"];
  /**
   * Le titre écrit au lancement par le petit modèle (le titre de la PR pour une
   * relecture, qui en a déjà un). `null` quand il manque : un run lancé avant
   * `agent_runs.title`, ou dont la génération a échoué — la conversation retombe
   * alors sur le titre du ticket, et une conversation carnet sur l'excerpt de sa
   * note.
   */
  title: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: RunRow["pr_state"];
  created_at: string;
  updated_at: string;
  /** Null = conversation carnet (MIN-84) ou de RELECTURE (MIN-168). */
  issue: RunRow["issue"];
  /**
   * La pull request que cette conversation RELIT (MIN-168) — non nul ⇒ badge
   * « Analyse de PR » et titre de la PR, là où une conversation de ticket montre
   * son identifiant. Ce n'est PAS la PR qu'un run de code aurait ouverte : celle-là
   * vit dans `pr_number` / `pr_url` / `pr_state`, et les deux ne se mélangent pas.
   */
  pullRequest: { id: string; number: number; title: string | null; url: string | null } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /** CE run travaille (queued/running) → « Numo travaille ». */
  working: boolean;
  /** Cette conversation est épinglée par l'utilisateur courant. */
  pinned: boolean;
  /**
   * Fin d'agent de ce run, ou `null`. Comparé au `last_read_at` de l'utilisateur
   * → bulle bleue « terminé, non lu ».
   */
  lastCompletedAt: string | null;
  /**
   * Ce run attend une réponse de l'utilisateur (tour terminé sur ask_user) →
   * point JAUNE au lieu du bleu, mêmes règles de lecture.
   */
  awaitingInput: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_runs")
    .select(
      "id, conversation_id, issue_id, pull_request_id, status, model, triggered_by, prompt, title, pr_number, pr_url, pr_state, created_at, updated_at, completed_at, awaiting_input, conversation:agent_conversations(title, visibility), issue:issues(id, number, title), project:projects(id, key, name, icon_url, orb_seed, deleted_at), pull_request:pull_requests(id, number, title, url)",
    )
    // Un passage de ROUTINE (MIN-185) n'est PAS une conversation : il vit dans
    // sa routine, sous « Exécutions précédentes », et nulle part ailleurs. Sans
    // ce filtre, une routine quotidienne noierait cette colonne en une semaine.
    .is("routine_id", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: pinRows, error: pinsError } = await auth.supabase
    .from("agent_conversation_pins")
    .select("conversation_id")
    .eq("user_id", auth.user.id);

  if (pinsError) return NextResponse.json({ error: pinsError.message }, { status: 500 });

  const pinnedConversationIds = new Set(
    (pinRows ?? []).map((row) => row.conversation_id as string),
  );

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
  // Un run, une conversation — aucun regroupement. Ce qui se lisait autrefois sur
  // le représentant d'un ticket (l'état de sa dernière run, sa PR, sa fin) se lit
  // maintenant sur chaque ligne, pour ce run-là et lui seul.
  const items: AgentSessionListItem[] = rows.map((r) => ({
    conversationId: r.conversation_id,
    runId: r.id,
    status: r.status,
    model: r.model,
    triggered_by: r.triggered_by,
    // Le titre de la PR pour une relecture (elle en a déjà un d'écrit), sinon
    // celui du titreur. À défaut — run d'avant `agent_runs.title`, ou génération
    // ratée —, l'excerpt de la note ; une conversation de ticket, elle, retombe
    // sur le titre du ticket, que le client a déjà sous la main.
    title:
      r.pull_request?.title?.trim() ||
      r.conversation?.title?.trim() ||
      r.title?.trim() ||
      (r.issue_id ? null : noteExcerpt(r.prompt)),
    pr_number: r.pr_number,
    pr_url: r.pr_url,
    pr_state: r.pr_state,
    created_at: r.created_at,
    updated_at: r.updated_at,
    issue: r.issue,
    pullRequest: r.pull_request,
    // Sans son `deleted_at`, qui n'a servi qu'au filtre ci-dessus : la réponse
    // ne porte que ce que la liste peint.
    project: r.project
      ? {
          id: r.project.id,
          key: r.project.key,
          name: r.project.name,
          icon_url: r.project.icon_url,
          orb_seed: r.project.orb_seed,
        }
      : null,
    working: WORKING_STATUSES.includes(r.status),
    pinned: pinnedConversationIds.has(r.conversation_id),
    lastCompletedAt: r.completed_at,
    awaitingInput: r.status === "completed" && r.awaiting_input,
  }));

  // Les épingles passent devant les conversations ordinaires. À l'intérieur de
  // chaque groupe, l'ordre reste celui de création : la liste ne se réordonne
  // pas au gré des synchronisations PR / webhooks.
  const sessions = items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
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
  managedServiceUnavailable: 503,
  noModelForProvider: 400,
  localEndpointRequiresLocalRun: 409,
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
    mentions?: unknown;
    attachments?: unknown;
    /** La conversation démarre sur la MACHINE de l'utilisateur (MIN-359). Une
     *  demande, que `localExecRequested` valide côté serveur. */
    localExec?: unknown;
    localWorktree?: unknown;
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
  const resources = parseResourcesInput(body.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const promptWithFiles = await promptWithAttachments(prompt, attachments);

  const result = await launchAgentRun({
    projectId,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt: promptWithFiles,
    model,
    forced: !!model,
    reasoningLevel,
    baseBranch,
    promptMentions: parseAgentMentions(body.mentions),
    localExec: body.localExec === true,
    localWorktree: body.localWorktree === true,
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
