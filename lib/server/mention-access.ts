import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { isObjectiveStatus, type ObjectiveStatus } from "@/lib/objective-validation";
import {
  mentionLinks,
  mentionTargetKey,
  relabelMentions,
  SCRATCHPAD_MENTION_ID,
  stripCutMention,
  type MentionLinkType,
  type MentionMeta,
} from "@/lib/mention-link";
import { mentionDateFrom } from "@/lib/mention-date";
import { findPullRequestsWithProjects } from "@/lib/server/agent/pull-requests";
import { getMcpConnection } from "@/lib/server/mcp-client";
import { mcpPresetForUrl } from "@/lib/mcp-catalog";
import { decodeRoutineTitle } from "@/lib/server/routine-content";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { decodeAttachmentRow } from "@/lib/server/attachment-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeProjectName } from "@/lib/server/project-content";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Who may see what a mention points at (MIN-734, MIN-872).
 *
 * A mention stores its target's id, and no name (`[@](mention:type/id)`,
 * lib/mention-link.ts). Every reader gets the target's CURRENT label when
 * they can access it — which also follows renames — and nothing at all
 * otherwise: the caller shows a neutral "unavailable" mention, without name,
 * project or metadata. Older mentions stored with a label resolve the same
 * way; that label is never returned.
 *
 * Access is the reader's project access for issues, objectives, pages,
 * resources, projects, routines and skills (a skill names its project in its
 * metadata). A pull request is visible through any project linking its
 * repository. A member is visible to a reader who shares a project with them.
 * A cycle and an MCP connection belong to one account: only their owner sees
 * them. The task notebook is a feature, and a date its own value: both are
 * visible to everyone.
 *
 * A resource (an attachment, MIN-742) is mentioned only from the surface that
 * holds it, and the app's pills resolve it from that surface alone. This
 * resolution serves what agents read and plain previews: the current name of
 * the attachment, under project access.
 */

export interface MentionRef {
  type: MentionLinkType;
  id: string;
  /** Only a skill's `project` matters to its resolution. */
  meta?: MentionMeta;
}

/** The label a reader may see for each target, or `null` when unavailable. */
export type MentionResolution = Map<string, string | null>;

export const mentionKey = (ref: MentionRef) => mentionTargetKey(ref.type, ref.id, ref.meta);

/** The label of the task notebook's mention, as agents read it. */
export const SCRATCHPAD_MENTION_LABEL = "Task notebook";

/** A date as agents read it: `2026-11-02 09:30 → 2026-11-04`. */
function dateLabel(ref: MentionRef): string | null {
  const date = mentionDateFrom(ref.id, ref.meta);
  if (!date) return null;
  return `${date.date}${date.time ? ` ${date.time}` : ""}${date.end ? ` → ${date.end}` : ""}`;
}

/** A skill's folder name, as stored in its mention id. */
const SKILL_ID = /^[A-Za-z0-9_.-]{1,64}$/;

/** Above this, a request is refused rather than resolved partially. */
export const MAX_MENTION_REFS = 200;
/** Distinct targets resolved in one agent reply. */
const MAX_RESULT_REFS = 1_000;
/** How deep an agent reply is walked for mentions. */
const MAX_DEPTH = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function rows(result: { data: unknown; error: unknown }, what: string): Row[] {
  if (result.error) throw new Error(`Unable to resolve ${what} mentions`);
  return (result.data ?? []) as Row[];
}

/** Resolve mention targets for `userId`. Unknown, deleted and inaccessible
 targets all resolve to `null`, indistinguishably. `objectiveStatuses`, when
 given, also receives the status of each objective the reader may open, for
 the glyph of its pill (MIN-785). `mcpServices` receives the known service
 of each MCP connection the reader owns, for the logo of its pill, and
 `pageFigures` each visible page's emoji and whether it is a database, for its
 glyph (MIN-879). */
export async function resolveMentionTargets(
  userId: string,
  refs: readonly MentionRef[],
  service: SupabaseClient = getServiceClient(),
  objectiveStatuses?: Map<string, ObjectiveStatus>,
  mcpServices?: Map<string, string>,
  pageFigures?: Map<string, { icon: string | null; database: boolean }>
): Promise<MentionResolution> {
  const resolution: MentionResolution = new Map();
  const unique = new Map<string, MentionRef>();
  const skills = new Map<string, MentionRef>();
  for (const ref of refs) {
    // Values that need no row: a date, the notebook.
    if (ref.type === "date") resolution.set(mentionKey(ref), dateLabel(ref));
    else if (ref.type === "scratchpad") {
      resolution.set(mentionKey(ref), ref.id === SCRATCHPAD_MENTION_ID ? SCRATCHPAD_MENTION_LABEL : null);
    } else if (ref.type === "skill") {
      const project = ref.meta?.project;
      resolution.set(mentionKey(ref), null);
      if (project && UUID.test(project) && SKILL_ID.test(ref.id)) skills.set(mentionKey(ref), ref);
    } else if (UUID.test(ref.id)) unique.set(mentionKey(ref), ref);
    else resolution.set(mentionKey(ref), null);
  }
  for (const key of unique.keys()) resolution.set(key, null);
  if (unique.size === 0 && skills.size === 0) return resolution;
  const idsOf = (type: MentionLinkType) =>
    [...unique.values()].filter((ref) => ref.type === type).map((ref) => ref.id);

  const none = Promise.resolve([] as Row[]);
  const [
    issues, objectives, pages, projects, memberships, resources, routines, cycles, pullRequests,
  ] = await Promise.all([
    // Only clear columns: an issue's label is its identifier.
    idsOf("issue").length
      ? issueStore(service, userId).select("id, project_id, number, deleted_at").in("id", idsOf("issue"))
        .then((result) => rows(result, "issue"))
      : none,
    idsOf("objective").length
      ? objectiveStore(service, userId).select("id, project_id, name, status, deleted_at").in("id", idsOf("objective"))
        .then((result) => rows(result, "objective"))
      : none,
    idsOf("page").length
      ? service.from("pages")
        .select("id, project_id, title, icon, database_schema, deleted_at, encrypted_content, encryption_version")
        .in("id", idsOf("page")).then((result) => rows(result, "page"))
      : none,
    idsOf("project").length
      ? service.from("projects")
        .select("id, key, name, deleted_at, encrypted_content, encryption_version")
        .in("id", idsOf("project")).then((result) => rows(result, "project"))
      : none,
    // A member of a project, or its owner — who has no `project_members` row.
    idsOf("member").length
      ? Promise.all([
          service.from("project_members").select("project_id, user_id").in("user_id", idsOf("member"))
            .then((result) => rows(result, "member")),
          service.from("projects").select("id, owner_id").in("owner_id", idsOf("member"))
            .then((result) => rows(result, "owner")
              .map((row) => ({ project_id: row.id, user_id: row.owner_id }))),
        ]).then(([members, owners]) => [...members, ...owners])
      : none,
    idsOf("resource").length
      ? service.from("attachments")
        .select("id, project_id, file_name")
        .in("id", idsOf("resource")).then((result) => rows(result, "resource"))
      : none,
    idsOf("routine").length
      ? service.from("agent_routines")
        .select("id, project_id, title, deleted_at, encrypted_content, encryption_version")
        .in("id", idsOf("routine")).then((result) => rows(result, "routine"))
      : none,
    // A cycle is personal: only its owner's are read at all.
    idsOf("cycle").length
      ? service.from("cycles").select("id, start_date, end_date")
        .eq("user_id", userId).in("id", idsOf("cycle")).then((result) => rows(result, "cycle"))
      : none,
    idsOf("pull_request").length ? findPullRequestsWithProjects(idsOf("pull_request"), service) : Promise.resolve([]),
  ]);

  const projectIds = new Set<string>();
  for (const row of [...issues, ...objectives, ...pages, ...resources, ...routines]) {
    if (typeof row.project_id === "string") projectIds.add(row.project_id);
  }
  for (const { projectIds: linked } of pullRequests) for (const id of linked) projectIds.add(id);
  for (const ref of skills.values()) projectIds.add(ref.meta!.project);
  for (const row of projects) projectIds.add(String(row.id));
  for (const row of memberships) projectIds.add(String(row.project_id));
  const issueProjects = [...new Set(issues.map((row) => String(row.project_id)))];
  const [allowed, keys] = await Promise.all([
    accessibleProjectIds(userId, [...projectIds]),
    // Issue identifiers need their project's key, a clear column.
    issueProjects.length
      ? service.from("projects").select("id, key").in("id", issueProjects)
        .then((result) => rows(result, "project key"))
      : none,
  ]);
  const keyOf = new Map(keys.map((row) => [String(row.id), String(row.key)]));
  const readable = (row: Row) => !row.deleted_at && allowed.has(String(row.project_id));

  for (const row of issues) {
    const key = keyOf.get(String(row.project_id));
    if (readable(row) && key) {
      resolution.set(`issue:${row.id}`, issueIdentifier(key, Number(row.number)));
    }
  }
  for (const row of objectives) {
    // The objective store returns names already decoded.
    if (!readable(row) || typeof row.name !== "string") continue;
    resolution.set(`objective:${row.id}`, row.name);
    if (isObjectiveStatus(row.status)) objectiveStatuses?.set(`objective:${row.id}`, row.status);
  }
  for (const stored of pages) {
    if (!readable(stored)) continue;
    const row = await decodePageProjection(stored, userId);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    // A page the reader may see but nobody titled yet (a subpage just
    // created): untitled, not unavailable.
    resolution.set(`page:${row.id}`, title || UNTITLED_PAGE_LABEL);
    pageFigures?.set(`page:${row.id}`, {
      icon: typeof row.icon === "string" && row.icon ? row.icon : null,
      database: Array.isArray(row.database_schema),
    });
  }
  for (const stored of resources) {
    if (!allowed.has(String(stored.project_id))) continue;
    // The attachment's own name, decoded like every attachment read. A page
    // resource keeps the title snapshot taken when it was added.
    const row = await decodeAttachmentRow("attachments", stored, userId);
    const name = typeof row.file_name === "string" ? row.file_name.trim() : "";
    resolution.set(`resource:${row.id}`, name || null);
  }
  for (const row of projects) {
    if (!row.deleted_at && allowed.has(String(row.id))) {
      resolution.set(`project:${row.id}`, await decodeProjectName(row, userId));
    }
  }
  for (const row of routines) {
    if (!readable(row)) continue;
    // A title that does not decode resolves as unavailable, not as a failure
    // of every other mention on the screen.
    const title = await decodeRoutineTitle(row, userId).catch(() => null);
    if (title) resolution.set(`routine:${row.id}`, title);
  }
  for (const row of cycles) {
    resolution.set(`cycle:${row.id}`, `Cycle ${String(row.start_date)} → ${String(row.end_date)}`);
  }
  for (const { pullRequest, projectIds: linked } of pullRequests) {
    if (!linked.some((id) => allowed.has(id))) continue;
    const title = pullRequest.title?.trim();
    resolution.set(`pull_request:${pullRequest.id}`, `#${pullRequest.number}${title ? ` ${title}` : ""}`);
  }
  for (const [key, ref] of skills) {
    if (allowed.has(ref.meta!.project)) resolution.set(key, ref.id);
  }
  // A connection is read under its owner's id: another account's reads as none.
  for (const id of idsOf("mcp")) {
    const connection = await getMcpConnection(userId, id).catch(() => null);
    if (!connection?.name) continue;
    resolution.set(`mcp:${id}`, connection.name);
    const known = mcpPresetForUrl(connection.url)?.id;
    if (known) mcpServices?.set(`mcp:${id}`, known);
  }
  const visibleMembers = new Set<string>(
    memberships.filter((row) => allowed.has(String(row.project_id))).map((row) => String(row.user_id))
  );
  if (idsOf("member").includes(userId)) visibleMembers.add(userId);
  if (visibleMembers.size) {
    const users = await fetchAuthUsersById(service, [...visibleMembers]);
    for (const id of visibleMembers) {
      const user = users.get(id);
      if (user) resolution.set(`member:${id}`, displayName(toNamed(user), "User"));
    }
  }
  return resolution;
}

/** The neutral label of a mention a reader may not see. */
export const UNAVAILABLE_MENTION_LABEL = "unavailable";

/** The label of a page the reader may see that has no title yet. */
export const UNTITLED_PAGE_LABEL = "Untitled";

/**
 * A Markdown text as `userId` may read it: each mention carries the target's
 * current label, or the neutral label when the target is not theirs to see.
 * Used on what agents read (MCP and Numo), which show the raw Markdown.
 */
export async function markdownForReader(
  userId: string,
  markdown: string,
  service?: SupabaseClient
): Promise<string> {
  const links = mentionLinks(markdown);
  if (links.length === 0) return markdown;
  const resolution = await resolveMentionTargets(userId, links.slice(0, MAX_MENTION_REFS), service);
  return relabelMentions(markdown, (link) =>
    resolution.get(mentionKey(link)) ?? UNAVAILABLE_MENTION_LABEL);
}

/**
 * Every string of a read result, relabeled for `userId` in one resolution:
 * descriptions, plans, comments, page bodies.
 */
export async function readResultForReader<T>(userId: string, value: T, service?: SupabaseClient): Promise<T> {
  const refs = new Map<string, MentionRef>();
  let deep = false;
  let cut = false;
  const collect = (node: unknown, depth: number) => {
    if (node === null || node === undefined) return;
    if (depth > MAX_DEPTH) {
      deep = true;
      return;
    }
    if (typeof node === "string") {
      if (node.includes("](mention:")) {
        for (const link of mentionLinks(node)) {
          refs.set(mentionKey(link), { type: link.type, id: link.id, ...(link.meta ? { meta: link.meta } : {}) });
        }
      }
      if (node.endsWith("…") && node.includes("[@")) cut = true;
      return;
    }
    if (Array.isArray(node)) for (const item of node) collect(item, depth + 1);
    else if (typeof node === "object") for (const item of Object.values(node)) collect(item, depth + 1);
  };
  collect(value, 0);
  if (refs.size === 0 && !cut && !deep) return value;
  // Distinct targets only, resolved in bounded chunks; any beyond the last
  // chunk read as unavailable.
  const resolution: MentionResolution = new Map();
  const distinct = [...refs.values()].slice(0, MAX_RESULT_REFS);
  for (let start = 0; start < distinct.length; start += MAX_MENTION_REFS) {
    const chunk = await resolveMentionTargets(userId, distinct.slice(start, start + MAX_MENTION_REFS), service);
    for (const [key, label] of chunk) resolution.set(key, label);
  }
  const relabel = (text: string, known: boolean) => {
    const relabeled = text.includes("](mention:")
      ? relabelMentions(text, (link) =>
        (known ? resolution.get(mentionKey(link)) : null) ?? UNAVAILABLE_MENTION_LABEL)
      : text;
    // A truncation marks its cut with "…": only such a text can end in a
    // mention cut in half. Code, patches and files are left as they are.
    return relabeled.endsWith("…") ? stripCutMention(relabeled) : relabeled;
  };
  const rewrite = (node: unknown, depth: number): unknown => {
    if (node === null || node === undefined) return node;
    // Beyond the walk's depth nothing is resolved: mentions there read as
    // unavailable rather than keeping their stored label.
    if (typeof node === "string") return relabel(node, depth <= MAX_DEPTH);
    if (Array.isArray(node)) return node.map((item) => rewrite(item, depth + 1));
    if (typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, rewrite(item, depth + 1)]));
    }
    return node;
  };
  return rewrite(value, 0) as T;
}
