import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import { isObjectiveStatus, type ObjectiveStatus } from "@/lib/objective-validation";
import {
  mentionLinks,
  relabelMentions,
  stripCutMention,
  type MentionLinkType,
} from "@/lib/mention-link";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { decodeAttachmentRow } from "@/lib/server/attachment-content";
import { decodePageProjection } from "@/lib/server/page-content";
import { decodeProjectName } from "@/lib/server/project-content";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Who may see what a mention points at (MIN-734).
 *
 * A mention stores the label its author saw (`[@Label](mention:type/id)`,
 * lib/mention-link.ts). Shown as is, that label would reveal the name of a
 * page, objective or project to a reader who cannot open it. Every reader
 * therefore gets the target's CURRENT label when they can access it — which
 * also follows renames — and nothing at all otherwise: the caller shows a
 * neutral "unavailable" mention, without name, project or metadata.
 *
 * Access is the reader's project access for issues, objectives, pages,
 * resources and projects. A member is visible to a reader who shares a
 * project with them.
 *
 * A resource (an attachment, MIN-742) is mentioned only from the surface that
 * holds it, and the app's pills resolve it from that surface alone. This
 * resolution serves what agents read and plain previews: the current name of
 * the attachment, under project access.
 */

export interface MentionRef {
  type: MentionLinkType;
  id: string;
}

/** The label a reader may see for each target, or `null` when unavailable. */
export type MentionResolution = Map<string, string | null>;

export const mentionKey = (ref: MentionRef) => `${ref.type}:${ref.id}`;

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
 the glyph of its pill (MIN-785). */
export async function resolveMentionTargets(
  userId: string,
  refs: readonly MentionRef[],
  service: SupabaseClient = getServiceClient(),
  objectiveStatuses?: Map<string, ObjectiveStatus>
): Promise<MentionResolution> {
  const resolution: MentionResolution = new Map();
  const unique = new Map<string, MentionRef>();
  for (const ref of refs) {
    if (UUID.test(ref.id)) unique.set(mentionKey(ref), ref);
    else resolution.set(mentionKey(ref), null);
  }
  for (const key of unique.keys()) resolution.set(key, null);
  if (unique.size === 0) return resolution;
  const idsOf = (type: MentionLinkType) =>
    [...unique.values()].filter((ref) => ref.type === type).map((ref) => ref.id);

  const none = Promise.resolve([] as Row[]);
  const [issues, objectives, pages, projects, memberships, resources] = await Promise.all([
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
        .select("id, project_id, title, icon, deleted_at, encrypted_content, encryption_version")
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
  ]);

  const projectIds = new Set<string>();
  for (const row of [...issues, ...objectives, ...pages, ...resources]) {
    if (typeof row.project_id === "string") projectIds.add(row.project_id);
  }
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
    resolution.set(`page:${row.id}`, title || null);
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
        for (const link of mentionLinks(node)) refs.set(mentionKey(link), { type: link.type, id: link.id });
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
