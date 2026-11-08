import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { feedbackPostStore } from "@/lib/server/feedback-post-store";
import { issueStore } from "@/lib/server/issue-store";
import { readResultForReader } from "@/lib/server/mention-access";
import { objectiveStore } from "@/lib/server/objective-store";
import { decodePageProjection } from "@/lib/server/page-content";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { decodeRoutineTitle } from "@/lib/server/routine-content";
import { listOpenJournalEntries } from "./journal-content";
import { listNumoMemories } from "./memory-content";
import { isNoiseField } from "./event-noise";
import type {
  WakeEvent,
  WakeInput,
  WakeJournalEntry,
  WakeMemory,
  WakeRelation,
  WakeSignal,
} from "./wake-decision";

/**
 * What the wake decision sees of one batch (MIN-928), read for the batch's
 * user: the journal rows of the batch in the projects they can still open,
 * each object's title decrypted through its domain store, how the user
 * stands toward each object, and their memories and open journal entries.
 *
 * A project the user left or trashed drops out entirely, events, memories
 * and journal entries alike. A title that fails to decode stays `null`, for
 * that row or, when a store refuses the whole read, for its kind in this
 * batch: the event is still judged on its type, actor and relations.
 */

type Row = Record<string, unknown>;

/** The journal columns this reader uses. */
export interface WakeEventRow {
  id: number;
  project_id: string;
  subject_type: string;
  subject_id: string;
  event: string;
  before_state: Row | null;
  after_state: Row | null;
  actor_id: string | null;
  actor_kind: string | null;
  changed_fields: string[] | null;
  recipient_id: string | null;
  created_at: string;
}

const EVENT_COLUMNS =
  "id, project_id, subject_type, subject_id, event, before_state, after_state, actor_id, actor_kind, changed_fields, recipient_id, created_at";

/** What the reader knows of one object, by `kind:id`. */
export interface WakeObject {
  title: string | null;
  reference?: string | null;
  /** Columns naming an account: `assignee_id`, `created_by`, `lead_user_id`, `owner_id`. */
  people: Partial<Record<"assignee" | "creator" | "lead" | "owner", string | null>>;
  priority?: string | null;
  sensitivity?: string | null;
}

export interface WakeLookup {
  userId: string;
  projects: ReadonlyMap<string, { key: string; owner_id: string }>;
  objects: ReadonlyMap<string, WakeObject>;
  /** Display names of the accounts the batch names; an unknown id has none. */
  names: ReadonlyMap<string, string>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function transition(before: unknown, after: unknown): string | null {
  const from = text(before);
  const to = text(after);
  if (!to) return from ? `${from} → (none)` : null;
  return from && from !== to ? `${from} → ${to}` : to;
}

const PULL_REQUEST_SIGNALS: Record<string, WakeSignal> = {
  pr_rejected: "pull_request_rejected",
  pr_changes_requested: "pull_request_changes_requested",
};

/** One journal row → its summary for the engines. Pure: every read happened before. */
export function summarizeWakeEvent(row: WakeEventRow, lookup: WakeLookup): WakeEvent {
  const after = row.after_state ?? {};
  const before = row.before_state ?? {};
  const object = lookup.objects.get(`${row.subject_type}:${row.subject_id}`);
  const project = lookup.projects.get(row.project_id);
  const me = lookup.userId;
  const relations = new Set<WakeRelation>();
  const signals = new Set<WakeSignal>();
  const details: Record<string, string> = {};
  const person = (id: unknown) => {
    const value = text(id);
    if (!value) return "nobody";
    return value === me ? "the user" : lookup.names.get(value) ?? "a teammate";
  };

  const people = object?.people ?? {};
  if (people.assignee === me || (row.subject_type === "issue" && after.assignee === me)) {
    relations.add("assignee");
  } else if (row.subject_type === "issue" && before.assignee === me) {
    relations.add("former_assignee");
    details.assignee = `the user → ${person(after.assignee)}`;
  }
  if (people.creator === me) relations.add("creator");
  if (people.lead === me || (row.subject_type === "objective" && after.lead === me)) relations.add("lead");
  if (row.subject_type === "routine" && (people.owner === me || after.owner === me)) relations.add("routine_owner");
  if (row.subject_type === "feedback" && project?.owner_id === me) relations.add("board_owner");
  if (row.event === "mention.received" && row.recipient_id === me) relations.add("mentioned");

  switch (row.event) {
    case "issue.status_changed":
    case "objective.status_changed": {
      const status = transition(before.status, after.status);
      if (status) details.status = status;
      break;
    }
    case "objective.target_date_changed": {
      const date = transition(before.target_date, after.target_date);
      if (date) details.target_date = date;
      break;
    }
    case "issue.assigned": {
      if (text(after.assignee)) details.assignee = person(after.assignee);
      break;
    }
    case "issue.pull_request": {
      const type = text(after.type);
      if (type) {
        details.pull_request = type;
        if (PULL_REQUEST_SIGNALS[type]) signals.add(PULL_REQUEST_SIGNALS[type]);
      }
      break;
    }
    case "routine.finished": {
      const status = text(after.status);
      if (status) details.status = status;
      if (status === "failed") signals.add("routine_failed");
      break;
    }
  }
  if (row.subject_type === "issue") {
    const priority = text(after.priority) ?? object?.priority ?? null;
    if (priority) details.priority = priority;
    const priorityNews = row.event === "issue.created" || (row.changed_fields ?? []).includes("priority");
    if (priority === "urgent" && priorityNews) signals.add("urgent_priority");
  }
  const sensitivity = object?.sensitivity;
  if (row.subject_type === "feedback" && sensitivity && sensitivity !== "none") {
    details.sensitivity = sensitivity;
    signals.add("sensitive_feedback");
  }
  // Moved to the trash: the triggers carry it in the state, the change list
  // only says `deleted_at`.
  if ((row.subject_type === "issue" || row.subject_type === "page") && after.deleted) details.deleted = "yes";

  const changed = (row.changed_fields ?? []).filter((field) => !isNoiseField(field));
  // A public feedback author is a board visitor, not an account.
  const actor = row.actor_id && row.actor_kind === "user"
    ? lookup.names.get(row.actor_id) ?? (row.subject_type === "feedback" ? "a feedback submitter" : "a teammate")
    : "automation";
  return {
    id: row.id,
    type: row.event,
    project: project?.key ?? "?",
    object: {
      kind: row.subject_type,
      reference: object?.reference ?? null,
      title: object?.title ?? null,
    },
    actor,
    ...(changed.length ? { changed } : {}),
    ...(Object.keys(details).length ? { details } : {}),
    relations: [...relations],
    signals: [...signals],
    at: row.created_at,
  };
}

/**
 * An `issue.updated` whose only news is the new assignee repeats the
 * `issue.assigned` row the trigger writes beside it: it goes.
 */
export function dropRepeatedAssignments(rows: readonly WakeEventRow[]): WakeEventRow[] {
  const assigned = new Set(rows.filter((row) => row.event === "issue.assigned").map((row) => row.subject_id));
  return rows.filter((row) => {
    if (row.event !== "issue.updated" || !assigned.has(row.subject_id)) return true;
    const news = (row.changed_fields ?? []).filter((field) => !isNoiseField(field) && field !== "assignee_id");
    return news.length > 0;
  });
}

function age(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(createdAt)) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`Unable to read ${what} for the wake decision`);
}

function idsOf(rows: readonly WakeEventRow[], kind: string): string[] {
  return [...new Set(rows.filter((row) => row.subject_type === kind).map((row) => row.subject_id))];
}

/** Decrypt one title; a failure leaves the event without one. */
async function safely(decode: () => Promise<string | null>): Promise<string | null> {
  try {
    return await decode();
  } catch {
    console.error("[numo-wake] title decode_failed");
    return null;
  }
}

type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/**
 * One kind of object, with titles when its store can decode every row. A
 * store decodes the whole selection at once, so one bad row refuses the
 * read: the kind is then read again without its title rather than losing
 * the batch.
 */
export async function readKind(kind: string, ids: readonly string[], titled: () => Query,
  plain: () => Query): Promise<Row[]> {
  if (ids.length === 0) return [];
  try {
    const { data, error } = await titled();
    if (!error) return (data ?? []) as Row[];
  } catch {
    // Read again without the title below.
  }
  console.error(`[numo-wake] ${kind} titles decode_failed`);
  const { data, error } = await plain();
  check(error, kind);
  return (data ?? []) as Row[];
}

async function loadObjects(service: SupabaseClient, userId: string, rows: WakeEventRow[],
  projectIds: string[], projectKeys: ReadonlyMap<string, string>): Promise<Map<string, WakeObject>> {
  const objects = new Map<string, WakeObject>();
  const issueIds = idsOf(rows, "issue");
  const objectiveIds = idsOf(rows, "objective");
  const pageIds = idsOf(rows, "page");
  const feedbackIds = idsOf(rows, "feedback");
  const routineIds = idsOf(rows, "routine");
  // Trashed objects are left out, as in the inbox: their events stay, untitled.
  const [issues, objectives, pages, feedback, routines] = await Promise.all([
    readKind("issues", issueIds,
      () => issueStore(service, userId).select("id, project_id, number, title, assignee_id, created_by, priority")
        .in("id", issueIds).in("project_id", projectIds).is("deleted_at", null),
      () => issueStore(service, userId).select("id, project_id, number, assignee_id, created_by, priority")
        .in("id", issueIds).in("project_id", projectIds).is("deleted_at", null)),
    readKind("objectives", objectiveIds,
      () => objectiveStore(service, userId).select("id, project_id, name, lead_user_id")
        .in("id", objectiveIds).in("project_id", projectIds).is("deleted_at", null),
      () => objectiveStore(service, userId).select("id, project_id, lead_user_id")
        .in("id", objectiveIds).in("project_id", projectIds).is("deleted_at", null)),
    readKind("pages", pageIds,
      () => service.from("pages").select("id, project_id, title, created_by, encrypted_content, encryption_version")
        .in("id", pageIds).in("project_id", projectIds).is("deleted_at", null),
      () => service.from("pages").select("id, project_id, created_by")
        .in("id", pageIds).in("project_id", projectIds).is("deleted_at", null)),
    readKind("feedback posts", feedbackIds,
      () => feedbackPostStore(service, userId).select("id, project_id, title, sensitivity")
        .in("id", feedbackIds).in("project_id", projectIds).is("deleted_at", null),
      () => feedbackPostStore(service, userId).select("id, project_id, sensitivity")
        .in("id", feedbackIds).in("project_id", projectIds).is("deleted_at", null)),
    readKind("routines", routineIds,
      () => service.from("agent_routines").select("id, project_id, title, owner_id, encrypted_content, encryption_version")
        .in("id", routineIds).in("project_id", projectIds).is("deleted_at", null),
      () => service.from("agent_routines").select("id, project_id, owner_id")
        .in("id", routineIds).in("project_id", projectIds).is("deleted_at", null)),
  ]);
  for (const row of issues) {
    const key = projectKeys.get(row.project_id as string);
    objects.set(`issue:${row.id}`, {
      title: text(row.title),
      reference: key ? issueIdentifier(key, Number(row.number)) : null,
      people: { assignee: text(row.assignee_id), creator: text(row.created_by) },
      priority: text(row.priority),
    });
  }
  for (const row of objectives) {
    objects.set(`objective:${row.id}`, { title: text(row.name), people: { lead: text(row.lead_user_id) } });
  }
  for (const row of pages) {
    const title = "encryption_version" in row
      ? await safely(async () => text((await decodePageProjection(row, userId)).title))
      : null;
    objects.set(`page:${row.id}`, { title, people: { creator: text(row.created_by) } });
  }
  for (const row of feedback) {
    objects.set(`feedback:${row.id}`, { title: text(row.title), people: {}, sensitivity: text(row.sensitivity) });
  }
  for (const row of routines) {
    const title = "encryption_version" in row ? await safely(() => decodeRoutineTitle(row, userId)) : null;
    objects.set(`routine:${row.id}`, { title, people: { owner: text(row.owner_id) } });
  }
  return objects;
}

/**
 * Read one batch as the wake decision sees it. Throws on a database failure,
 * so the batch is retried by a later tick; returns no event when nothing of
 * the batch is still the user's to see.
 */
export async function loadWakeInput(service: SupabaseClient, batch: {
  user_id: string;
  event_ids: number[];
}, now = new Date()): Promise<WakeInput> {
  const userId = batch.user_id;
  const { data, error } = await service.from("routine_events").select(EVENT_COLUMNS)
    .in("id", batch.event_ids).order("id");
  check(error, "the batch's events");
  const all = ((data ?? []) as WakeEventRow[])
    // A mention reaches its recipient only; the routing already enforces it.
    .filter((row) => !row.recipient_id || row.recipient_id === userId);
  if (all.length === 0) return { events: [], memories: [], journal: [] };

  const [memories, journal] = await Promise.all([
    listNumoMemories(service, userId),
    listOpenJournalEntries(service, userId),
  ]);
  const candidateProjects = [...new Set([
    ...all.map((row) => row.project_id),
    ...memories.flatMap((m) => m.project_id ? [m.project_id] : []),
    ...journal.flatMap((j) => j.project_id ? [j.project_id] : []),
  ])];
  const visible = await accessibleProjectIds(userId, candidateProjects);
  // `accessibleProjectIds` reads a database error as "no access": confirm
  // the database answers before closing the batch as empty.
  if (visible.size === 0) {
    const { error: probeError } = await service.from("projects").select("id")
      .in("id", candidateProjects).limit(1);
    check(probeError, "projects");
    return { events: [], memories: [], journal: [] };
  }
  const { data: projectRows, error: projectError } = await service.from("projects")
    .select("id, key, owner_id").in("id", [...visible]).is("deleted_at", null);
  check(projectError, "projects");
  const projects = new Map(((projectRows ?? []) as Array<{ id: string; key: string; owner_id: string }>)
    .map((p) => [p.id, { key: p.key, owner_id: p.owner_id }]));
  // A trashed project stays accessible, but its events are no news.
  const rows = dropRepeatedAssignments(all.filter((row) => projects.has(row.project_id)));
  if (rows.length === 0) return { events: [], memories: [], journal: [] };
  const projectKeys = new Map([...projects].map(([id, p]) => [id, p.key]));
  const eventProjects = [...new Set(rows.map((row) => row.project_id))];

  const people = new Set<string>();
  for (const row of rows) {
    if (row.actor_id) people.add(row.actor_id);
    for (const state of [row.after_state, row.before_state]) {
      if (typeof state?.assignee === "string") people.add(state.assignee);
    }
  }
  const [objects, users] = await Promise.all([
    loadObjects(service, userId, rows, eventProjects, projectKeys),
    people.size ? fetchAuthUsersById(service, [...people]) : Promise.resolve(new Map()),
  ]);
  // Only accounts get a name; an unknown id (a public feedback author) keeps
  // the summary's fallback.
  const names = new Map([...people].flatMap((id) =>
    users.has(id) ? [[id, displayName(toNamed(users.get(id)))] as const] : []));
  const lookup: WakeLookup = { userId, projects, objects, names };

  // A memory of another project says nothing about this batch. Project
  // memories come first: they are the most specific.
  const inBatch = new Set(eventProjects);
  const wakeMemories: WakeMemory[] = [
    ...memories.filter((m) => m.project_id !== null && inBatch.has(m.project_id))
      .map((m) => ({ scope: projectKeys.get(m.project_id!) ?? "project", text: m.content })),
    ...memories.filter((m) => m.project_id === null).map((m) => ({ scope: "all projects", text: m.content })),
  ];
  const wakeJournal: WakeJournalEntry[] = journal
    .filter((j) => j.project_id === null || projects.has(j.project_id))
    .map((j) => ({
      age: age(j.created_at, now),
      project: j.project_id ? projectKeys.get(j.project_id) ?? null : null,
      text: j.content,
    }));
  // Mentions are stored without labels: give them the label the user may see.
  const labeled = await readResultForReader(userId, { memories: wakeMemories, journal: wakeJournal }, service)
    .catch(() => ({ memories: wakeMemories, journal: wakeJournal }));

  return {
    events: rows.map((row) => summarizeWakeEvent(row, lookup)),
    memories: labeled.memories,
    journal: labeled.journal,
  };
}
