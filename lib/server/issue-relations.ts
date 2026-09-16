import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  insertEvents,
  stampMcpKey,
  stampViaAssistant,
  type EventRow,
} from "@/lib/server/issue-events";
import {
  normalizeRelation,
  isRelationType,
  endpointType,
} from "@/lib/relation-constants";
import { scheduleCycleBlockerPull } from "@/lib/server/cycles";
import type {
  IssueRelationType,
  RelationEndpointType,
} from "@/lib/types";

/**
 * Shared issue-relation core (MIN-25, extended to objectives in MIN-513) — used
 * by the HTTP routes, the MCP tool and Numo. Access is enforced HERE (writes
 * bypass RLS): the actor must be able to access the relation's project, and
 * both endpoints must live in that project.
 *
 * Only `blocks` and `related` are stored; `blocked_by` is folded into an
 * inverted `blocks` edge by normalizeRelation. Adding a relation that already
 * exists is idempotent (returns the existing row, no duplicate event).
 *
 * Endpoints are polymorphic (MIN-513): each carries a kind — `issue` (default)
 * or `objective` — and must exist as such in the project (the DB trigger also
 * enforces this; an explicit check here gives a clean 404).
 */

export interface IssueRelationRow {
  id: string;
  source_id: string;
  source_type?: RelationEndpointType;
  target_id: string;
  target_type?: RelationEndpointType;
  type: "blocks" | "related";
}

const RELATION_COLUMNS =
  "id, source_id, source_type, target_id, target_type, type";

/** A relation endpoint descriptor: kind defaults to `issue`. */
export interface RelationEndpointSpec {
  id: string;
  type?: RelationEndpointType | null;
}

type RelationErrorKey =
  | "invalidRelationType"
  | "relationSelf"
  | "issueNotFound"
  | "relationNotFound"
  | "databaseError";

export type AddRelationResult =
  | { ok: true; relation: IssueRelationRow }
  | { ok: false; status: number; errorKey?: RelationErrorKey; rawMessage?: string };

export type RemoveRelationResult =
  | { ok: true; relation: IssueRelationRow }
  | { ok: false; status: number; errorKey?: RelationErrorKey; rawMessage?: string };

/** Perspective-correct activity events for the ISSUE endpoints of a stored
    row. An objective end has no timeline of its own, so it contributes no
    event — a relation between two objectives is recorded in neither. */
function relationEvents(
  kind: "relation_added" | "relation_removed",
  row: {
    source_id: string;
    source_type?: RelationEndpointType | null;
    target_id: string;
    target_type?: RelationEndpointType | null;
    type: "blocks" | "related";
  },
  actorId: string
): EventRow[] {
  const events: EventRow[] = [];
  if (row.type === "blocks") {
    if (endpointType(row.source_type) === "issue") {
      events.push({
        issue_id: row.source_id,
        actor_id: actorId,
        type: kind,
        field: "blocks",
        to_value: row.target_id,
      });
    }
    if (endpointType(row.target_type) === "issue") {
      events.push({
        issue_id: row.target_id,
        actor_id: actorId,
        type: kind,
        field: "blocked_by",
        to_value: row.source_id,
      });
    }
  } else {
    if (endpointType(row.source_type) === "issue") {
      events.push({
        issue_id: row.source_id,
        actor_id: actorId,
        type: kind,
        field: "related",
        to_value: row.target_id,
      });
    }
    if (endpointType(row.target_type) === "issue") {
      events.push({
        issue_id: row.target_id,
        actor_id: actorId,
        type: kind,
        field: "related",
        to_value: row.source_id,
      });
    }
  }
  return events;
}

/** All relation rows of a project (raw stored form). Pass an RLS or service
    client — both are pinned by project_id. */
export async function listIssueRelations(
  db: SupabaseClient,
  projectId: string
): Promise<{ relations: IssueRelationRow[] } | { error: string }> {
  const { data, error } = await db
    .from("issue_relations")
    .select(RELATION_COLUMNS)
    .eq("project_id", projectId);
  if (error) return { error: error.message };
  return { relations: (data ?? []) as IssueRelationRow[] };
}

/** Find a single stored relation matching a (source, type, target) spec from
    the caller's perspective — used by the MCP tool to remove by reference. */
export async function findIssueRelation(
  projectId: string,
  source: string | RelationEndpointSpec,
  type: IssueRelationType,
  target: string | RelationEndpointSpec
): Promise<IssueRelationRow | null> {
  const stored = normalizeRelation(source, type, target);
  const { data } = await getServiceClient()
    .from("issue_relations")
    .select(RELATION_COLUMNS)
    .eq("project_id", projectId)
    .eq("type", stored.type)
    .eq("source_id", stored.source_id)
    .eq("target_id", stored.target_id)
    .maybeSingle();
  return (data as IssueRelationRow) ?? null;
}

/** Raw relation rows touching one issue (either endpoint) — for enrichment. */
export async function listRelationsForIssue(
  db: SupabaseClient,
  issueId: string
): Promise<IssueRelationRow[]> {
  const { data } = await db
    .from("issue_relations")
    .select(RELATION_COLUMNS)
    .or(`source_id.eq.${issueId},target_id.eq.${issueId}`);
  return (data ?? []) as IssueRelationRow[];
}

/** Both endpoints must belong to the project in scope and be alive — issues
    and objectives both trash softly (the DB trigger also enforces the
    same-project rule, but an explicit check gives a clean 404). */
async function assertEndpointsInProject(
  service: ReturnType<typeof getServiceClient>,
  projectId: string,
  endpoints: Array<{ id: string; type: RelationEndpointType }>
): Promise<boolean> {
  const issueIds = endpoints
    .filter((e) => e.type === "issue")
    .map((e) => e.id);
  const objectiveIds = endpoints
    .filter((e) => e.type === "objective")
    .map((e) => e.id);
  if (issueIds.length > 0) {
    const { data } = await service
      .from("issues")
      .select("id")
      .is("deleted_at", null)
      .eq("project_id", projectId)
      .in("id", issueIds);
    if ((data ?? []).length !== issueIds.length) return false;
  }
  if (objectiveIds.length > 0) {
    const { data } = await service
      .from("objectives")
      .select("id")
      .is("deleted_at", null)
      .eq("project_id", projectId)
      .in("id", objectiveIds);
    if ((data ?? []).length !== objectiveIds.length) return false;
  }
  return true;
}

export async function addIssueRelation({
  projectId,
  actorId,
  sourceId,
  targetId,
  type,
  sourceType = "issue",
  targetType = "issue",
  viaAssistant = false,
  mcpKeyId = null,
}: {
  projectId: string;
  actorId: string;
  sourceId: string;
  targetId: string;
  /** Relation type from `sourceId`'s perspective. */
  type: IssueRelationType;
  /** What each endpoint is (MIN-513) — default `issue` for both. */
  sourceType?: RelationEndpointType;
  targetType?: RelationEndpointType;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<AddRelationResult> {
  if (!isRelationType(type)) {
    return { ok: false, status: 400, errorKey: "invalidRelationType" };
  }
  if (!sourceId || !targetId || sourceId === targetId) {
    return { ok: false, status: 400, errorKey: "relationSelf" };
  }

  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "issueNotFound" };

  const service = getServiceClient();

  const alive = await assertEndpointsInProject(service, projectId, [
    { id: sourceId, type: sourceType },
    { id: targetId, type: targetType },
  ]);
  if (!alive) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const stored = normalizeRelation(
    { id: sourceId, type: sourceType },
    type,
    { id: targetId, type: targetType }
  );

  const { data, error } = await service
    .from("issue_relations")
    .insert({ ...stored, project_id: projectId, created_by: actorId })
    .select(RELATION_COLUMNS)
    .single();

  if (error) {
    // Unique violation → the relation already exists: idempotent success, no
    // event. The DB canonicalizes `related`, so the stored form is what we look
    // up (for related, either direction resolves to the same canonical row).
    if (error.code === "23505") {
      const { data: existing } = await service
        .from("issue_relations")
        .select(RELATION_COLUMNS)
        .eq("project_id", projectId)
        .eq("type", stored.type)
        .eq("source_id", stored.source_id)
        .eq("target_id", stored.target_id)
        .maybeSingle();
      if (existing) return { ok: true, relation: existing as IssueRelationRow };
    }
    if (error.code === "P0001") {
      return { ok: false, status: 400, rawMessage: error.message };
    }
    console.error("[issue-relations] insert failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const row = data as IssueRelationRow;
  await insertEvents(
    service,
    stampMcpKey(
      stampViaAssistant(relationEvents("relation_added", row, actorId), viaAssistant),
      mcpKeyId
    )
  );

  // Cycle coherence (MIN-32): a fresh `blocks` edge whose BLOCKED issue sits in
  // a current cycle pulls the blocker in after the response ("pas B sans A"),
  // rebalancing without ever evicting started work. Stored form only — the
  // blocked_by direction was normalized above. Edges touching an OBJECTIVE are
  // left out (MIN-513): "pulling in" an objective has no meaning, the blocked
  // issue is simply skipped by the fill until the objective closes.
  if (
    row.type === "blocks" &&
    endpointType(row.source_type) === "issue" &&
    endpointType(row.target_type) === "issue"
  ) {
    scheduleCycleBlockerPull({
      blockerId: row.source_id,
      blockedId: row.target_id,
      actorId,
      viaAssistant,
      mcpKeyId,
    });
  }

  return { ok: true, relation: row };
}

export async function removeIssueRelation({
  relationId,
  actorId,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  relationId: string;
  actorId: string;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<RemoveRelationResult> {
  const service = getServiceClient();

  const { data: row } = await service
    .from("issue_relations")
    .select("id, project_id, source_id, source_type, target_id, target_type, type")
    .eq("id", relationId)
    .maybeSingle();
  if (!row) return { ok: false, status: 404, errorKey: "relationNotFound" };

  const access = await getProjectAccess(actorId, row.project_id as string);
  if (!access) return { ok: false, status: 404, errorKey: "relationNotFound" };

  const { error } = await service
    .from("issue_relations")
    .delete()
    .eq("id", relationId);
  if (error) {
    console.error("[issue-relations] delete failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const stored = {
    source_id: row.source_id as string,
    source_type: endpointType(row.source_type),
    target_id: row.target_id as string,
    target_type: endpointType(row.target_type),
    type: row.type as "blocks" | "related",
  };
  await insertEvents(
    service,
    stampMcpKey(
      stampViaAssistant(
        relationEvents("relation_removed", stored, actorId),
        viaAssistant
      ),
      mcpKeyId
    )
  );
  return { ok: true, relation: { id: row.id as string, ...stored } };
}
