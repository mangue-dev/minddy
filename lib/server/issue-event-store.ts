import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "./issue-events";
import { canWriteLegacyHistory, decodeHistoryRow, encodeHistoryRow } from "./encryption/history-content";
import { decodeIntegrationField } from "./integration-content";

export type EventParent = { issue_id: string } | { objective_id: string } |
  { feedback_post_id: string } | { page_id: string };
export type ReadEvent = EventRow & { id: string; integration?: { name: string } | null };
const parents = { issue_id: "issues", objective_id: "objectives", feedback_post_id: "feedback_posts", page_id: "pages" } as const;

/** Resolve ownership from the parent; callers cannot choose the key's project. */
export async function storeIssueEvents(service: SupabaseClient, rows: EventRow[]): Promise<void> {
  let stored: Record<string, unknown>[] = rows.map((row) => ({ ...row }));
  if (!canWriteLegacyHistory()) {
    const identities = rows.map((row) => {
      const keys = (Object.keys(parents) as (keyof typeof parents)[]).filter((key) => row[key] != null);
      if (keys.length !== 1) throw new Error("Invalid activity parent");
      return { key: keys[0], parent: row[keys[0]]!, identity: `${keys[0]}:${row[keys[0]]}` };
    });
    const distinct = new Map(identities.map((entry) => [entry.identity, entry]));
    const owners = new Map(await Promise.all([...distinct.values()].map(async ({ key, parent, identity }) => {
      const { data, error } = await service.from(parents[key]).select("project_id").eq("id", parent).single();
      if (error || typeof data?.project_id !== "string") throw new Error("Unable to resolve activity owner");
      return [identity, data.project_id as string] as const;
    })));
    stored = [];
    for (const [index, row] of rows.entries()) {
      const projectId = owners.get(identities[index].identity)!;
      stored.push(await encodeHistoryRow("issue_events", {
        ...row, id: randomUUID(), project_id: projectId,
        from_value: row.from_value ?? null, to_value: row.to_value ?? null,
        starts_work: row.field === "status" && row.to_value === "in_progress",
      }));
    }
  }
  const { error } = await service.from("issue_events").insert(stored, { defaultToNull: false });
  if (error) throw new Error("Unable to persist activity");
}

/** The caller supplies an authorized parent or an RLS client, as for every repository read. */
export async function readIssueEvents(service: SupabaseClient, parent: EventParent, options: {
  actorId?: string | null; projectId?: string; limit?: number; descending?: boolean; integrations?: boolean;
} = {}): Promise<{ data: ReadEvent[] | null; error: { message: string } | null }> {
  try {
    const [column, id] = Object.entries(parent)[0];
    const columns: string = options.integrations
      ? "*, integration:integrations(id,project_id,name)" : "*";
    let query = service.from("issue_events").select(columns)
      .eq(column, id).order("created_at", { ascending: !options.descending });
    if (options.limit !== undefined) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error("Activity read failed");
    const decoded: ReadEvent[] = [];
    for (const row of data ?? []) {
      const event=await decodeHistoryRow("issue_events",
        row as unknown as Record<string, unknown>,
        options.actorId ?? null, options.projectId) as unknown as ReadEvent;
      const integration=(event as ReadEvent & {integration?:
        {id:string;project_id:string;name:string}|null}).integration;
      if(integration){
        if(options.projectId && integration.project_id!==options.projectId)
          throw new Error("Integration project mismatch");
        event.integration={name:(await decodeIntegrationField(integration,
          "name",integration.name))!};
      }
      decoded.push(event);
    }
    return { data: decoded, error: null };
  } catch {
    return { data: null, error: { message: "Unable to read activity" } };
  }
}

/** Equality on protected values happens after decoding, with pagination before any match decision. */
export async function hasMatchingIssueEvent(service: SupabaseClient, options: {
  issueIds: string[]; type: string; after: string; before?: string;
  actorIds?: string[]; fromValue?: string | null; toValue: string;
}): Promise<boolean> {
  if (!options.issueIds.length) return false;
  for (let offset = 0; ; offset += 500) {
    let query = service.from("issue_events").select("*")
      .in("issue_id", options.issueIds).eq("type", options.type).gte("created_at", options.after)
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (options.before) query = query.lte("created_at", options.before);
    query = options.actorIds ? query.in("actor_id", options.actorIds) : query.is("actor_id", null);
    const { data, error } = await query;
    if (error) throw new Error("Unable to check activity duplicate");
    for (const row of data ?? []) {
      const event = await decodeHistoryRow("issue_events", row, null);
      if (event.to_value === options.toValue &&
          (options.actorIds || event.from_value === (options.fromValue ?? null))) return true;
    }
    if (!data || data.length < 500) return false;
  }
}

export async function hasRecentPageActivity(service: SupabaseClient, pageId: string, type: string,
  kind: string, actorId: string | null, after: string): Promise<boolean> {
  const { data } = await service.from("issue_events").select("id").eq("page_id", pageId)
    .eq("type", type).eq("field", kind).filter("actor_id", actorId ? "eq" : "is", actorId ?? null)
    .gte("created_at", after).limit(1);
  return !!data?.length;
}

export async function previouslyAssignedIssues(service: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const { data, error } = await service.from("issue_events").select("issue_id")
    .eq("field", "assignee_id").in("issue_id", ids);
  if (error) throw new Error("Unable to read assignment history");
  return new Set((data ?? []).map((row) => row.issue_id as string));
}

/** The issue fields whose corrections are counted (MIN-988). */
const CORRECTED_FIELDS = ["title", "priority", "effort", "objective_id", "assignee_id"] as const;
const CATEGORY_CHANGE_TYPES = ["category_added", "category_removed"] as const;

/** A row of activity reduced to what no key protects: no value, no actor. */
export interface FieldEventMark {
  issue_id: string;
  type: string;
  field: string | null;
  created_at: string;
  via_smart_fill: boolean;
  smart_assign_ai: boolean;
}

const MARK_COLUMNS = "issue_id, type, field, created_at, via_smart_fill, smart_assign_ai";

/**
 * Field changes made by a person, by hand, since `since`: an actor, and none
 * of the marks of an automated write (Smart Fill, Smart Assign, Numo, MCP,
 * an automation, an integration, a forge sync). Newest first, `limit` rows
 * at most. Reads clear metadata only: the values stay sealed.
 */
export async function listManualFieldChanges(service: SupabaseClient,
  options: { since: string; limit: number }): Promise<FieldEventMark[]> {
  const rows: FieldEventMark[] = [];
  for (let offset = 0; offset < options.limit; offset += 1000) {
    const { data, error } = await service.from("issue_events").select(MARK_COLUMNS)
      .not("issue_id", "is", null).not("actor_id", "is", null)
      .eq("via_smart_fill", false).eq("via_smart_assign", false).eq("via_assistant", false)
      .eq("via_mcp", false).eq("via_automation", false)
      .is("forge_sync", null).is("integration_id", null)
      .gte("created_at", options.since)
      .or(`and(type.eq.updated,field.in.(${CORRECTED_FIELDS.join(",")})),type.in.(${CATEGORY_CHANGE_TYPES.join(",")})`)
      .order("created_at", { ascending: false }).order("id", { ascending: true })
      .range(offset, Math.min(offset + 999, options.limit - 1));
    if (error) throw new Error("Unable to read manual field changes");
    rows.push(...((data ?? []) as unknown as FieldEventMark[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** What Smart Fill, or the model of Smart Assign, wrote on these issues since `since`. */
export async function listAiFieldWrites(service: SupabaseClient,
  options: { issueIds: readonly string[]; since: string }): Promise<FieldEventMark[]> {
  const rows: FieldEventMark[] = [];
  const ids = [...new Set(options.issueIds)];
  for (let offset = 0; offset < ids.length; offset += 150) {
    const { data, error } = await service.from("issue_events").select(MARK_COLUMNS)
      .in("issue_id", ids.slice(offset, offset + 150))
      .or("via_smart_fill.eq.true,smart_assign_ai.eq.true")
      .gte("created_at", options.since)
      .order("created_at", { ascending: true }).limit(5000);
    if (error) throw new Error("Unable to read automated field writes");
    rows.push(...((data ?? []) as unknown as FieldEventMark[]));
  }
  return rows;
}
