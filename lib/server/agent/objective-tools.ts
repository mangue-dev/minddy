import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { addCommentToObjective } from "@/lib/server/add-comment";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import {
  issueIdentifier,
  isClosedStatus,
  type IssueEffort,
  type IssueStatus,
} from "@/lib/issue-constants";
import { effortToPoints, statusCompletionCredit } from "@/lib/cycle";
import { isObjectiveStatus } from "@/lib/objective-validation";
import { resourceSummary } from "@/lib/server/resource-select";

/**
 * Les OBJECTIFS pour l'agent de code (MIN-287) — le but auquel sert le ticket
 * qu'il implémente.
 *
 * Le trou que ces tools ferment n'était pas « un tool de plus » : l'agent
 * travaillait sur un ticket sans jamais savoir à quoi ce ticket sert, et un
 * ticket qu'il créait tombait hors de tout objectif — donc hors des barres de
 * progression et hors du remplissage de cycle. La doctrine du MCP vaut ici mot
 * pour mot : ce qu'on n'a pas rangé, quelqu'un devra le ranger à la main.
 *
 * Aucune logique métier ici, volontairement : `createObjective` /
 * `updateObjective` ([lib/server/objectives.ts](../objectives.ts)) et
 * `addCommentToObjective` ([lib/server/add-comment.ts](../add-comment.ts)) sont
 * les noyaux du MCP et de l'app — événements d'activité, notifications, mentions
 * et liens de pages compris. Ce module traduit les arguments du modèle, épingle
 * tout au projet du run et rend la forme de résultat de la boucle.
 *
 * La progression est PONDÉRÉE par l'effort avec crédit partiel par statut
 * (`effortToPoints` × `statusCompletionCredit`) : exactement le calcul de la
 * barre de l'UI et de `minddy_list_objectives`. Trois lecteurs qui donneraient
 * trois pourcentages du même objectif, c'est trois vérités.
 *
 * Ils sont routés avec les tools ticket (`ISSUE_TOOL_NAMES`) pour la raison qui
 * a rangé les pages là (MIN-273) : même contexte — le projet du run et son
 * acteur — et une famille de plus dans le routage n'apporterait que du câblage.
 */

/** La forme de résultat de la boucle, déclarée localement comme dans les autres
    modules de tools de plateforme (le type de `tool-loop.ts` n'est pas exporté). */
type ToolOutcome = { result: unknown; success: boolean };

export interface ObjectiveToolContext {
  projectId: string;
  /** Clé du projet — les tickets d'un objectif se nomment « MIN-42 », pas par uuid. */
  projectKey: string;
  /** Propriétaire du run : l'acteur de toute lecture d'accès et de toute écriture. */
  actorId: string | null;
}

/** Les noms servis au modèle, tels que `lib/server/agent/tools.ts` les déclare. */
export const OBJECTIVE_TOOL_NAMES = new Set([
  "list_objectives",
  "read_objective",
  "create_objective",
  "update_objective",
  "comment_objective",
]);

/** Description tronquée dans la LISTE : elle sert à choisir, pas à lire. Le
    document entier est dans `read_objective`. */
const LIST_DESCRIPTION_MAX_CHARS = 400;
/** Derniers commentaires du fil d'un objectif, comme sur un ticket. */
const COMMENTS_DEFAULT_LIMIT = 15;
const COMMENT_BODY_MAX_CHARS = 2000;

function truncate(value: string | null, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.length <= max ? value : `${value.slice(0, max)}… [truncated]`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedObjective {
  id: string;
  name: string;
}

/**
 * L'objectif VISÉ — par uuid OU par nom (insensible à la casse).
 *
 * Le nom est là parce que c'est ce qu'un modèle recopie : `list_objectives` rend
 * les deux, et entre « Refonte du board » et un uuid de 36 caractères, celui qui
 * se recopie sans faute n'est pas celui qu'on croit. Un nom ambigu est une
 * erreur qui NOMME les candidats — pas un choix arbitraire fait à sa place.
 */
export async function resolveObjectiveRef(
  projectId: string,
  ref: unknown,
): Promise<{ objective: ResolvedObjective } | { error: string }> {
  const raw = typeof ref === "string" ? ref.trim() : "";
  if (!raw) {
    return {
      error:
        "objective is required — pass its id or its exact name. List them with list_objectives.",
    };
  }
  const service = getServiceClient();
  const query = service
    .from("objectives")
    .select("id, name")
    .is("deleted_at", null)
    .eq("project_id", projectId);

  if (UUID_RE.test(raw)) {
    const { data } = await query.eq("id", raw).maybeSingle();
    if (!data) return { error: "Objective not found in this project." };
    return { objective: { id: data.id as string, name: data.name as string } };
  }

  const { data } = await query.ilike("name", raw);
  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      error: `No objective named "${raw}" in this project — list_objectives shows the ones that exist (match the name exactly, or pass the id).`,
    };
  }
  if (rows.length > 1) {
    return {
      error: `Several objectives are named "${raw}" — pass an id instead: ${rows
        .map((o) => `${o.id} (${o.name})`)
        .join(", ")}.`,
    };
  }
  return { objective: { id: rows[0].id as string, name: rows[0].name as string } };
}

/** Progression pondérée d'un lot de tickets — le calcul de la barre de l'UI. */
function progressOf(
  issues: Array<{ status: unknown; effort: unknown }>,
): { done: number; total: number; percent: number } {
  let done = 0;
  let totalPoints = 0;
  let earnedPoints = 0;
  for (const issue of issues) {
    const status = issue.status as IssueStatus;
    if (isClosedStatus(status)) done += 1;
    const points = effortToPoints(issue.effort as IssueEffort | null);
    totalPoints += points;
    earnedPoints += points * statusCompletionCredit(status);
  }
  return {
    done,
    total: issues.length,
    percent: totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
  };
}

async function listObjectives(ctx: ObjectiveToolContext): Promise<ToolOutcome> {
  const service = getServiceClient();
  const [{ data, error }, { data: linked }] = await Promise.all([
    service
      .from("objectives")
      .select("id, name, description, status, lead_user_id, target_date")
      .is("deleted_at", null)
      .eq("project_id", ctx.projectId)
      .order("created_at", { ascending: true }),
    service
      .from("issues")
      .select("objective_id, status, effort")
      .is("deleted_at", null)
      .eq("project_id", ctx.projectId)
      .not("objective_id", "is", null),
  ]);
  if (error) return { result: { error: error.message }, success: false };

  const byObjective = new Map<string, Array<{ status: unknown; effort: unknown }>>();
  for (const issue of linked ?? []) {
    const id = issue.objective_id as string;
    const list = byObjective.get(id) ?? [];
    list.push(issue);
    byObjective.set(id, list);
  }

  const leads = await fetchAuthUsersById(
    service,
    (data ?? [])
      .map((o) => o.lead_user_id)
      .filter((v): v is string => typeof v === "string"),
  ).catch(() => null);

  const objectives = (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    description: truncate(o.description as string | null, LIST_DESCRIPTION_MAX_CHARS),
    status: o.status,
    lead_name:
      typeof o.lead_user_id === "string" && leads
        ? displayName(toNamed(leads.get(o.lead_user_id)), "User")
        : null,
    target_date: o.target_date,
    progress: progressOf(byObjective.get(o.id as string) ?? []),
  }));

  return {
    result: {
      count: objectives.length,
      objectives,
      ...(objectives.length === 0
        ? {
            note: "This project has no objective yet. Do not invent one — say so, and create_objective only if the user asks for it.",
          }
        : {}),
    },
    success: true,
  };
}

async function readObjective(
  ctx: ObjectiveToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const target = await resolveObjectiveRef(ctx.projectId, args.objective);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const service = getServiceClient();
  const { data: objective, error } = await service
    .from("objectives")
    .select("id, name, description, status, lead_user_id, target_date, created_at")
    .is("deleted_at", null)
    .eq("id", target.objective.id)
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (error) return { result: { error: error.message }, success: false };
  if (!objective) {
    return { result: { error: "Objective not found in this project." }, success: false };
  }

  const [{ data: issues }, { data: comments }, { data: attachmentRows }] =
    await Promise.all([
      service
        .from("issues")
        .select("id, number, title, status, priority, effort, assignee_id")
        .is("deleted_at", null)
        .eq("objective_id", objective.id)
        .order("number", { ascending: true }),
      service
        .from("comments")
        .select("id, author_id, body, parent_id, via_assistant, created_at")
        .eq("objective_id", objective.id)
        .order("created_at", { ascending: true }),
      // Ressources de l'objectif LUI-MÊME (`comment_id` null) — fichiers, liens
      // et pages du wiki. Elles s'ouvrent ensuite par `read_resource`, qui
      // accepte déjà une ressource portée par un objectif du projet.
      service
        .from("attachments")
        .select(
          "id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(id, title, deleted_at)",
        )
        .eq("objective_id", objective.id)
        .is("comment_id", null)
        .order("created_at", { ascending: true }),
    ]);

  const users = await fetchAuthUsersById(service, [
    ...(comments ?? []).map((c) => c.author_id as string),
    ...(issues ?? [])
      .map((i) => i.assignee_id)
      .filter((v): v is string => typeof v === "string"),
    ...(typeof objective.lead_user_id === "string" ? [objective.lead_user_id] : []),
  ]).catch(() => null);

  const named = (id: unknown): string | null =>
    typeof id === "string" && users ? displayName(toNamed(users.get(id)), "User") : null;

  const total = (comments ?? []).length;
  const recent = (comments ?? []).slice(-COMMENTS_DEFAULT_LIMIT);
  const resources = (attachmentRows ?? []).map((row) => resourceSummary(row));

  return {
    result: {
      objective: {
        id: objective.id,
        name: objective.name,
        description: objective.description,
        status: objective.status,
        lead_name: named(objective.lead_user_id),
        target_date: objective.target_date,
        progress: progressOf(issues ?? []),
        ...(resources.length ? { resources } : {}),
      },
      issues: (issues ?? []).map((i) => ({
        id: i.id,
        identifier: issueIdentifier(ctx.projectKey, i.number as number),
        title: i.title,
        status: i.status,
        priority: i.priority,
        effort: i.effort,
        assignee_name: named(i.assignee_id),
      })),
      comments: recent.map((c) => ({
        id: c.id,
        author: c.via_assistant ? "Numo" : named(c.author_id),
        body: truncate(String(c.body ?? ""), COMMENT_BODY_MAX_CHARS),
        parent_id: c.parent_id,
        created_at: c.created_at,
      })),
      comments_total: total,
      ...(total > recent.length
        ? { comments_note: `Older comments omitted — the ${recent.length} most recent are here.` }
        : {}),
    },
    success: true,
  };
}

async function createObjectiveTool(
  ctx: ObjectiveToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) return { result: { error: "name is required." }, success: false };
  if (args.status !== undefined && !isObjectiveStatus(args.status)) {
    return {
      result: { error: "status must be one of: planned, in_progress, done, canceled." },
      success: false,
    };
  }

  const result = await createObjective({
    projectId: ctx.projectId,
    actorId: ctx.actorId,
    viaAssistant: true,
    input: {
      name,
      ...(typeof args.description === "string" ? { description: args.description } : {}),
      ...(typeof args.status === "string" ? { status: args.status } : {}),
      ...(typeof args.target_date === "string" ? { target_date: args.target_date } : {}),
    },
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Objective creation refused." },
      success: false,
    };
  }
  return {
    result: {
      ok: true,
      objective: {
        id: result.objective.id,
        name: result.objective.name,
        status: result.objective.status,
      },
      next: "An objective with no issue has a progress bar stuck at zero — attach its issues with update_issue { objective } (or create_issue { objective }).",
    },
    success: true,
  };
}

async function updateObjectiveTool(
  ctx: ObjectiveToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };

  const input: Record<string, unknown> = {};
  const changed: string[] = [];
  if (args.name !== undefined) {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!name) return { result: { error: "name cannot be empty." }, success: false };
    input.name = name;
    changed.push("name");
  }
  if (args.description !== undefined) {
    input.description = typeof args.description === "string" ? args.description : null;
    changed.push("description");
  }
  if (args.status !== undefined) {
    if (!isObjectiveStatus(args.status)) {
      return {
        result: { error: "status must be one of: planned, in_progress, done, canceled." },
        success: false,
      };
    }
    input.status = args.status;
    changed.push("status");
  }
  if (args.target_date !== undefined) {
    input.target_date = typeof args.target_date === "string" ? args.target_date : null;
    changed.push("target_date");
  }
  if (changed.length === 0) {
    return {
      result: {
        error: "Nothing to update — pass at least one of name, description, status or target_date.",
      },
      success: false,
    };
  }

  // Épinglage au projet du run AVANT l'écriture : le noyau, lui, résout le
  // projet depuis l'objectif — un id d'un autre projet accessible au lanceur y
  // passerait. Ici, il est introuvable.
  const target = await resolveObjectiveRef(ctx.projectId, args.objective);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const result = await updateObjective({
    objectiveId: target.objective.id,
    actorId: ctx.actorId,
    input,
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? result.rawMessage ?? "Objective update refused." },
      success: false,
    };
  }
  return {
    result: { ok: true, objective: { id: target.objective.id, name: result.objective.name }, changed },
    success: true,
  };
}

async function commentObjective(
  ctx: ObjectiveToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (!ctx.actorId) return { result: { error: "Run has no owner." }, success: false };
  const body = typeof args.body === "string" ? args.body.trim() : "";
  if (!body) return { result: { error: "body is required." }, success: false };

  const target = await resolveObjectiveRef(ctx.projectId, args.objective);
  if ("error" in target) return { result: { error: target.error }, success: false };

  const result = await addCommentToObjective({
    objectiveId: target.objective.id,
    actorId: ctx.actorId,
    body,
    viaAssistant: true,
  });
  if (!result.ok) {
    return {
      result: { error: result.errorKey ?? "Comment refused." },
      success: false,
    };
  }
  return {
    result: {
      ok: true,
      objective: { id: target.objective.id, name: target.objective.name },
      comment_id: (result.comment as { id?: string }).id,
    },
    success: true,
  };
}

/** Exécute un tool objectif. L'appelant a déjà routé sur `OBJECTIVE_TOOL_NAMES`. */
export async function executeObjectiveTool(
  ctx: ObjectiveToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  switch (name) {
    case "list_objectives":
      return await listObjectives(ctx);
    case "read_objective":
      return await readObjective(ctx, args);
    case "create_objective":
      return await createObjectiveTool(ctx, args);
    case "update_objective":
      return await updateObjectiveTool(ctx, args);
    case "comment_objective":
      return await commentObjective(ctx, args);
    default:
      return { result: { error: `Unknown objective tool: ${name}` }, success: false };
  }
}
