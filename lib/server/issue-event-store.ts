import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "./issue-events";
import { canWriteLegacyHistory, decodeHistoryRow, encodeHistoryRow } from "./encryption/history-content";

export type EventParent = { issue_id: string } | { objective_id: string } |
  { feedback_post_id: string } | { page_id: string };
export type ReadEvent = EventRow & { id: string; integration?: { name: string } | null };
const parents = { issue_id: "issues", objective_id: "objectives", feedback_post_id: "feedback_posts", page_id: "pages" } as const;

/** Resolve ownership from the parent; callers cannot choose the key's project. */
export async function storeIssueEvents(service: SupabaseClient, rows: EventRow[]): Promise<void> {
  let stored: Record<string, unknown>[] = rows.map((row) => ({ ...row }));
  if (!canWriteLegacyHistory()) {
    const owners = new Map<string, string>();
    stored = [];
    for (const row of rows) {
      const keys = (Object.keys(parents) as (keyof typeof parents)[]).filter((key) => row[key] != null);
      if (keys.length !== 1) throw new Error("Invalid activity parent");
      const key = keys[0];
      const parent = row[key]!;
      const identity = `${key}:${parent}`;
      let projectId = owners.get(identity);
      if (!projectId) {
        const { data, error } = await service.from(parents[key]).select("project_id").eq("id", parent).single();
        if (error || typeof data?.project_id !== "string") throw new Error("Unable to resolve activity owner");
        projectId = data.project_id as string;
        owners.set(identity, projectId);
      }
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
    const columns: string = options.integrations ? "*, integration:integrations(name)" : "*";
    let query = service.from("issue_events").select(columns)
      .eq(column, id).order("created_at", { ascending: !options.descending });
    if (options.limit !== undefined) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error("Activity read failed");
    const decoded: ReadEvent[] = [];
    for (const row of data ?? []) {
      decoded.push(await decodeHistoryRow("issue_events", row as unknown as Record<string, unknown>, options.actorId ?? null, options.projectId) as unknown as ReadEvent);
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
