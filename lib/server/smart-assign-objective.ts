import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { canUseSmartAssign } from "@/lib/server/entitlements";
import { requestEmbeddings } from "@/lib/server/embeddings";
import { issueStore } from "@/lib/server/issue-store";
import { listProjectEmbeddings } from "@/lib/server/issue-embedding-store";
import {
  embeddingText,
  indexVersion,
  lexicalScore,
  MIN_LEXICAL_SCORE,
  rankVectorNeighbours,
} from "@/lib/server/issue-relation-inference";
import { resolveIssueIndexing } from "@/lib/smart-fill";

/**
 * SMART ASSIGN FOR OBJECTIVES (MIN-919) — the lead of an objective nobody led.
 *
 * On a project with Smart Assign on, an objective is never left without a
 * lead, as an active issue is never left without an assignee: the lead is
 * chosen when an objective is created without one, and again when someone
 * clears it. The pickers say so: their empty entry reads "Smart Assign"
 * instead of "No lead".
 *
 * The choice reads the WORK, not a prompt: the issues closest to the
 * objective's name and description are found by meaning (the issue index of
 * MIN-717, with the same lexical fallback when no compatible vector exists),
 * and each member scores the similarity of the issues assigned to them. The
 * member who handles the most of that work leads; with no such issue, the
 * project owner does, as Smart Assign falls back for issues.
 *
 * The only paid step is the query vector, billed to the project owner like
 * Smart Assign's decision, gated by the owner's budget and skipped when the
 * owner refused issue indexing. No vector, no charge: the lexical path costs
 * nothing.
 */

/** Issues read as the objective's work, at most. */
const NEIGHBOUR_POOL = 20;
/** Recent issues the lexical fallback reads, at most. */
const LEXICAL_POOL = 300;
const CLOSED_STATUSES = new Set(["canceled", "duplicate"]);

export interface ObjectiveLeadChoice {
  leadId: string;
  /** True when the issues the members handle decided; false for the owner fallback. */
  fromWork: boolean;
}

/**
 * The member whose assigned issues weigh most among the neighbours. Pure.
 * Ties go to the member with more issues, then to the owner, then to the
 * smaller id, so the same input always gives the same lead. `null` when no
 * neighbour is assigned to a team member.
 */
export function pickLeadFromNeighbours(
  neighbours: readonly { score: number; assigneeId: string | null }[],
  teamIds: readonly string[],
  ownerId: string,
): string | null {
  const team = new Set(teamIds);
  const tally = new Map<string, { score: number; count: number }>();
  for (const n of neighbours) {
    if (!n.assigneeId || !team.has(n.assigneeId) || !(n.score > 0)) continue;
    const entry = tally.get(n.assigneeId) ?? { score: 0, count: 0 };
    entry.score += n.score;
    entry.count += 1;
    tally.set(n.assigneeId, entry);
  }
  let best: string | null = null;
  for (const [id, entry] of tally) {
    if (best === null) { best = id; continue; }
    const current = tally.get(best)!;
    const better =
      entry.score > current.score ||
      (entry.score === current.score && entry.count > current.count) ||
      (entry.score === current.score && entry.count === current.count &&
        (id === ownerId || (best !== ownerId && id < best)));
    if (better) best = id;
  }
  return best;
}

/** The team Smart Assign may pick from: the owner, then members with the
 * member role (readers never lead). */
async function readTeam(
  service: SupabaseClient,
  projectId: string,
): Promise<{ ownerId: string; teamIds: string[]; enabled: boolean } | null> {
  const [{ data: project }, { data: memberRows }] = await Promise.all([
    service
      .from("projects")
      .select("owner_id, smart_assign_enabled")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    service.from("project_members").select("user_id").eq("project_id", projectId).eq("role", "member"),
  ]);
  if (!project) return null;
  const ownerId = project.owner_id as string;
  const teamIds = [
    ownerId,
    ...(memberRows ?? []).map((m) => m.user_id as string).filter((id) => id !== ownerId),
  ];
  return { ownerId, teamIds, enabled: project.smart_assign_enabled === true };
}

async function ownerAllowsIndexing(service: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data, error } = await service.auth.admin.getUserById(ownerId);
  if (error || !data.user) return false;
  return resolveIssueIndexing((data.user.user_metadata ?? {}) as Record<string, unknown>);
}

/** Neighbours by meaning, in the index version of the owner's embedding runtime. */
async function vectorNeighbours(
  service: SupabaseClient,
  projectId: string,
  ownerId: string,
  text: string,
): Promise<{ id: string; score: number }[]> {
  if (!(await canUseSmartAssign(ownerId))) return [];
  if (!(await ownerAllowsIndexing(service, ownerId))) return [];
  const batch = await requestEmbeddings([text], {
    modelKey: "issue_embedding_model",
    surface: "automations",
    feature: "smart_assign",
    billedUserId: ownerId,
    record: { billTo: { userId: ownerId }, projectId },
    dimensions: "any",
    xTitle: "Smart Assign objective lead",
  });
  const query = batch?.vectors[0];
  if (!batch || !query) return [];
  const rows = await listProjectEmbeddings(
    service,
    projectId,
    indexVersion(batch.provider, batch.model, query.length),
  ).catch(() => []);
  return rankVectorNeighbours(query, rows, "").slice(0, NEIGHBOUR_POOL);
}

/** Neighbours by shared words, among the project's recent issues. Free. */
async function lexicalNeighbours(
  service: SupabaseClient,
  projectId: string,
  text: string,
): Promise<{ id: string; score: number }[]> {
  const { data, error } = await issueStore(service)
    .select("id, title, description, status")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LEXICAL_POOL);
  if (error) return [];
  const ranked: { id: string; score: number }[] = [];
  for (const row of (data ?? []) as { id: string; title: string; description: string | null; status: string }[]) {
    if (CLOSED_STATUSES.has(row.status)) continue;
    const score = lexicalScore(text, `${row.title}\n${row.description ?? ""}`);
    if (score >= MIN_LEXICAL_SCORE) ranked.push({ id: row.id, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked.slice(0, NEIGHBOUR_POOL);
}

/**
 * The lead Smart Assign gives an objective with this name and description,
 * or `null` when Smart Assign is off on the project (or the project is gone).
 * The owner stands in whenever the work decides nothing. Never throws.
 */
export async function suggestObjectiveLead({
  projectId,
  name,
  description,
}: {
  projectId: string;
  name: string;
  description: string | null;
}): Promise<ObjectiveLeadChoice | null> {
  try {
    const service = getServiceClient();
    const team = await readTeam(service, projectId);
    if (!team?.enabled) return null;
    const { ownerId, teamIds } = team;
    // Alone on the project: no choice to make, nothing to pay.
    if (teamIds.length === 1) return { leadId: ownerId, fromWork: false };

    const text = embeddingText(name, description);
    let neighbours = await vectorNeighbours(service, projectId, ownerId, text).catch(() => []);
    if (neighbours.length === 0) neighbours = await lexicalNeighbours(service, projectId, text);
    if (neighbours.length === 0) return { leadId: ownerId, fromWork: false };

    const { data, error } = await issueStore(service)
      .select("id, assignee_id, status")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .in("id", neighbours.map((n) => n.id));
    if (error) return { leadId: ownerId, fromWork: false };
    const assignees = new Map<string, string | null>();
    for (const row of (data ?? []) as { id: string; assignee_id: string | null; status: string }[]) {
      if (!CLOSED_STATUSES.has(row.status)) assignees.set(row.id, row.assignee_id);
    }
    const picked = pickLeadFromNeighbours(
      neighbours.map((n) => ({ score: n.score, assigneeId: assignees.get(n.id) ?? null })),
      teamIds,
      ownerId,
    );
    return picked ? { leadId: picked, fromWork: true } : { leadId: ownerId, fromWork: false };
  } catch {
    console.error("[smart-assign-objective] lead choice failed");
    return null;
  }
}

/**
 * The lead event. No actor, as for an issue Smart Assign assigns: the gesture
 * is automated, and the flags make the timeline name Smart Assign.
 */
export function objectiveLeadEvent(objectiveId: string, choice: ObjectiveLeadChoice) {
  return {
    objective_id: objectiveId,
    actor_id: null,
    type: "updated",
    field: "lead_user_id",
    from_value: null,
    to_value: choice.leadId,
    via_smart_assign: true,
    smart_assign_ai: choice.fromWork,
  };
}
