import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  mentionLinks,
  relabelMentions,
  stripCutMention,
  type MentionLinkType,
} from "@/lib/mention-link";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
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
 * Access is the reader's project access for issues, objectives, pages and
 * projects. A member is visible to a reader who shares a project with them.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function rows(result: { data: unknown; error: unknown }, what: string): Row[] {
  if (result.error) throw new Error(`Unable to resolve ${what} mentions`);
  return (result.data ?? []) as Row[];
}

/** Resolve mention targets for `userId`. Unknown, deleted and inaccessible
 targets all resolve to `null`, indistinguishably. */
export async function resolveMentionTargets(
  userId: string,
  refs: readonly MentionRef[],
  service: SupabaseClient = getServiceClient()
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
  const [issues, objectives, pages, projects, memberships] = await Promise.all([
    // Only clear columns: an issue's label is its identifier.
    idsOf("issue").length
      ? issueStore(service, userId).select("id, project_id, number, deleted_at").in("id", idsOf("issue"))
        .then((result) => rows(result, "issue"))
      : none,
    idsOf("objective").length
      ? objectiveStore(service, userId).select("id, project_id, name, deleted_at").in("id", idsOf("objective"))
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
    idsOf("member").length
      ? service.from("project_members").select("project_id, user_id").in("user_id", idsOf("member"))
        .then(({ data, error }) => {
          if (error) throw new Error("Unable to resolve member mentions");
          return (data ?? []) as Row[];
        })
      : Promise.resolve([] as Row[]),
  ]);

  const projectIds = new Set<string>();
  for (const row of [...issues, ...objectives, ...pages]) {
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
    if (readable(row) && typeof row.name === "string") resolution.set(`objective:${row.id}`, row.name);
  }
  for (const stored of pages) {
    if (!readable(stored)) continue;
    const row = await decodePageProjection(stored, userId);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    resolution.set(`page:${row.id}`, title || null);
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
  const refs: MentionRef[] = [];
  const collect = (node: unknown, depth: number) => {
    if (depth > 12 || node === null || node === undefined) return;
    if (typeof node === "string") {
      if (node.includes("](mention:")) refs.push(...mentionLinks(node));
      if (node.includes("[@")) cut = true;
      return;
    }
    if (Array.isArray(node)) for (const item of node) collect(item, depth + 1);
    else if (typeof node === "object") for (const item of Object.values(node)) collect(item, depth + 1);
  };
  let cut = false;
  collect(value, 0);
  if (refs.length === 0 && !cut) return value;
  const resolution: MentionResolution = refs.length
    ? await resolveMentionTargets(userId, refs.slice(0, MAX_MENTION_REFS), service)
    : new Map();
  const rewrite = (node: unknown, depth: number): unknown => {
    if (depth > 12 || node === null || node === undefined) return node;
    if (typeof node === "string") {
      const relabeled = node.includes("](mention:")
        ? relabelMentions(node, (link) => resolution.get(mentionKey(link)) ?? UNAVAILABLE_MENTION_LABEL)
        : node;
      return stripCutMention(relabeled);
    }
    if (Array.isArray(node)) return node.map((item) => rewrite(item, depth + 1));
    if (typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, rewrite(item, depth + 1)]));
    }
    return node;
  };
  return rewrite(value, 0) as T;
}
