import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayName } from "@/lib/display-name";
import type { IssueEffort, IssueStatus } from "@/lib/issue-constants";
import { SCRATCHPAD_MENTION_ID } from "@/lib/mention-link";
import {
  cutExcerpt,
  type MentionPreview,
  type PreviewMentionType,
  type PreviewProject,
  DATABASE_PREVIEW_COLUMNS,
  DATABASE_PREVIEW_ROWS,
  PROJECT_PREVIEW_MEMBERS,
  type DatabasePreviewCell,
} from "@/lib/mention-preview";
import { mcpPresetForUrl } from "@/lib/mcp-catalog";
import { databaseValueText, type DatabaseProperty, type DatabaseValue } from "@/lib/page-databases";
import { memberRoleFromRow } from "@/lib/project-roles";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { resolveRelations, type DisplayRelation } from "@/lib/relation-constants";
import type { IssueRelation, Objective } from "@/lib/types";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { categoryStore } from "@/lib/server/category-store";
import { issueStore } from "@/lib/server/issue-store";
import { getMcpConnection } from "@/lib/server/mcp-client";
import { resolveMentionTargets, type MentionRef } from "@/lib/server/mention-access";
import { objectiveStore } from "@/lib/server/objective-store";
import { getPage } from "@/lib/server/pages";
import { pageBodyToMarkdownServer } from "@/lib/server/pages-projection";
import { decodePageProjection } from "@/lib/server/page-content";
import type { JSONContent } from "@tiptap/core";
import { decodeProject } from "@/lib/server/project-content";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { findPullRequestsWithProjects } from "@/lib/server/agent/pull-requests";
import { listProjectRepositorySkills, loadProjectRepositorySkills } from "@/lib/server/repository-skills";
import { getRoutineForUser } from "@/lib/server/routines";
import { getScratchpad } from "@/lib/server/scratchpad";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * The hover card of one mention (MIN-879), for `userId`.
 *
 * Access is decided first, by the same resolution that names a mention
 * (lib/server/mention-access.ts): a target without a label for this reader
 * has no card either, and unknown, deleted and inaccessible targets all
 * answer `null`. Only then are its details read, in service key and scoped
 * to the project that resolution allowed.
 *
 * `surfaceProject` is the project the mention is read in: a member's card
 * gives their role and arrival date there, when the reader shares it.
 */
export async function previewMentionTarget(
  userId: string,
  ref: MentionRef & { type: PreviewMentionType },
  surfaceProject: string | null = null,
  service: SupabaseClient = getServiceClient(),
): Promise<MentionPreview | null> {
  if (ref.type === "scratchpad") {
    if (ref.id !== SCRATCHPAD_MENTION_ID) return null;
    const notebook = await getScratchpad(service, userId);
    return {
      type: "scratchpad",
      excerpt: cutExcerpt(notebook.content),
      progress: { done: notebook.progress.done, total: notebook.progress.total },
      updatedAt: notebook.updated_at,
    };
  }
  // A page, a routine, a cycle and an MCP connection are read through their
  // own guarded readers, which apply the same rule as the resolution (project
  // access and not trashed; the owner alone): asking the resolution first
  // would read and decode them twice.
  if (!SELF_GUARDED.has(ref.type)) {
    const resolution = await resolveMentionTargets(userId, [ref], service);
    if ([...resolution.values()][0] == null) return null;
  }
  switch (ref.type) {
    case "issue": return issuePreview(userId, ref.id, service);
    case "objective": return objectivePreview(userId, ref.id, service);
    case "page": return pagePreview(userId, ref.id, service);
    case "project": return projectPreview(userId, ref.id, service);
    case "member": return memberPreview(userId, ref.id, surfaceProject, service);
    case "routine": return routinePreview(userId, ref.id, service);
    case "cycle": return cyclePreview(userId, ref.id, service);
    case "pull_request": return pullRequestPreview(ref.id, service);
    case "mcp": return mcpPreview(userId, ref.id);
    case "skill": return skillPreview(ref.id, ref.meta?.project ?? null);
  }
}

type Row = Record<string, unknown>;

/** Types whose reader below enforces their access rule itself. */
const SELF_GUARDED: ReadonlySet<PreviewMentionType> = new Set(["page", "routine", "cycle", "mcp"]);

async function previewProject(projectId: string, userId: string, service: SupabaseClient): Promise<PreviewProject | null> {
  const { data } = await service.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!data) return null;
  const project = await decodeProject(data as Row, userId);
  return {
    id: String(project.id),
    name: String(project.name ?? ""),
    key: String(project.key ?? ""),
    orbSeed: projectOrbSeed({ id: String(project.id), orb_seed: (project.orb_seed as string | null) ?? null }),
    iconUrl: (project.icon_url as string | null) ?? null,
  };
}

/** An objective as a relation pill shows it. */
function relationObjective(row: Row): Objective {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    name: String(row.name ?? ""),
    description: null,
    status: row.status as Objective["status"],
    lead_user_id: (row.lead_user_id as string | null) ?? null,
    target_date: (row.target_date as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * The relations of an issue or an objective, from its own side, with the
 * other end named as the board's pills show it. Trashed ends are dropped.
 */
async function displayRelations(
  entityId: string,
  projectId: string,
  userId: string,
  service: SupabaseClient,
): Promise<DisplayRelation[]> {
  const { data } = await service.from("issue_relations")
    .select("id, source_id, source_type, target_id, target_type, type")
    .eq("project_id", projectId)
    .or(`source_id.eq.${entityId},target_id.eq.${entityId}`);
  const rows = (data ?? []) as unknown as IssueRelation[];
  if (rows.length === 0) return [];
  const ends = new Set(rows.flatMap((row) => [row.source_id, row.target_id]));
  const [issues, objectives] = await Promise.all([
    issueStore(service, userId).select("*").eq("project_id", projectId).is("deleted_at", null).in("id", [...ends])
      .then(({ data: found }) => (found ?? []) as Row[]),
    objectiveStore(service, userId).select("id, project_id, name, status, color, lead_user_id, target_date, created_at, updated_at")
      .eq("project_id", projectId).is("deleted_at", null).in("id", [...ends])
      .then(({ data: found }) => ((found ?? []) as Row[]).map(relationObjective)),
  ]);
  const issueById = new Map(issues.map((row) => [String(row.id), row]));
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const resolved = resolveRelations(
    entityId,
    rows,
    new Map(issues.map((row) => [String(row.id), row.status as IssueStatus])),
    new Map(objectives.map((objective) => [objective.id, objective.status])),
  );
  return resolved.flatMap((relation): DisplayRelation[] => {
    if (relation.otherType === "objective") {
      const other = objectiveById.get(relation.otherId);
      return other ? [{ ...relation, otherName: other.name, otherObjective: other }] : [];
    }
    const other = issueById.get(relation.otherId);
    return other
      ? [{ ...relation, otherNumber: Number(other.number), otherName: String(other.title), otherStatus: other.status as IssueStatus }]
      : [];
  });
}

async function issuePreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const { data } = await issueStore(service, userId).select("*, issue_categories(category_id)")
    .eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const row = data as Row;
  const projectId = String(row.project_id);
  const categoryIds = ((row.issue_categories as Array<{ category_id: string }> | undefined) ?? [])
    .map((entry) => entry.category_id);
  const [project, relations, categories, objective, parent, assignee] = await Promise.all([
    previewProject(projectId, userId, service),
    displayRelations(id, projectId, userId, service),
    categoryIds.length
      ? categoryStore(service, userId).select("id, name, color").eq("project_id", projectId).in("id", categoryIds)
        .then(({ data: found }) => ((found ?? []) as Row[]).map((category) => ({
          id: String(category.id), name: String(category.name), color: String(category.color),
        })))
      : Promise.resolve([]),
    typeof row.objective_id === "string"
      ? objectiveStore(service, userId).select("id, name, color, status").eq("id", row.objective_id)
        .is("deleted_at", null).maybeSingle()
        .then(({ data: found }) => found
          ? { id: String(found.id), name: String(found.name), color: (found.color as string | null) ?? null, status: found.status }
          : null)
      : Promise.resolve(null),
    typeof row.parent_id === "string"
      ? issueStore(service, userId).select("number").eq("id", row.parent_id).is("deleted_at", null).maybeSingle()
        .then(({ data: found }) => (found ? Number(found.number) : null))
      : Promise.resolve(null),
    typeof row.assignee_id === "string" ? projectMember(projectId, row.assignee_id, service) : Promise.resolve(null),
  ]);
  if (!project) return null;
  return {
    type: "issue",
    project,
    issue: {
      id,
      project_id: projectId,
      number: Number(row.number),
      title: String(row.title),
      description: typeof row.description === "string" ? row.description.slice(0, 400) : null,
      status: row.status as IssueStatus,
      priority: row.priority as never,
      effort: (row.effort as IssueEffort | null) ?? null,
      assignee_id: (row.assignee_id as string | null) ?? null,
      objective_id: objective ? objective.id : null,
      due_date: (row.due_date as string | null) ?? null,
      recurrence: (row.recurrence as never) ?? null,
      category_ids: categories.map((category) => category.id),
      plan: (row.plan as string | null) ?? null,
      integration_id: (row.integration_id as string | null) ?? null,
      remote_provider: (row.remote_provider as never) ?? null,
      remote_number: (row.remote_number as number | null) ?? null,
      remote_url: (row.remote_url as string | null) ?? null,
    },
    assignee,
    categories,
    objective,
    parentNumber: parent,
    relations,
  };
}

/** A member of `projectId` — its owner included — as the board names them. */
async function projectMember(projectId: string, userId: string, service: SupabaseClient) {
  const [{ data: project }, { data: membership }] = await Promise.all([
    service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    service.from("project_members").select("role, created_at").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
  ]);
  const isOwner = project?.owner_id === userId;
  if (!isOwner && !membership) return null;
  const [users, seeds] = await Promise.all([
    fetchAuthUsersById(service, [userId]),
    fetchAvatarSeeds(service, [userId]),
  ]);
  return {
    user_id: userId,
    ...toNamed(users.get(userId)),
    avatar_seed: seeds.get(userId) ?? userId,
    role: isOwner ? "owner" as const : memberRoleFromRow(membership?.role),
    can_comment: isOwner,
    is_owner: isOwner,
    joined_at: isOwner ? null : ((membership?.created_at as string | null) ?? null),
  };
}

async function objectivePreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const { data } = await objectiveStore(service, userId).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) return null;
  const projectId = String(data.project_id);
  const [project, relations, issues, lead] = await Promise.all([
    previewProject(projectId, userId, service),
    displayRelations(id, projectId, userId, service),
    issueStore(service, userId).select("status, effort").eq("project_id", projectId).eq("objective_id", id)
      .is("deleted_at", null)
      .then(({ data: found }) => ((found ?? []) as Row[]).map((issue) => ({
        status: issue.status as IssueStatus, effort: (issue.effort as IssueEffort | null) ?? null,
      }))),
    typeof data.lead_user_id === "string" ? projectMember(projectId, data.lead_user_id, service) : Promise.resolve(null),
  ]);
  if (!project) return null;
  return {
    type: "objective",
    project,
    objective: {
      id,
      name: String(data.name),
      color: (data.color as string | null) ?? null,
      status: data.status,
      targetDate: (data.target_date as string | null) ?? null,
    },
    excerpt: cutExcerpt(data.description as string | null),
    lead: lead ? { user_id: lead.user_id, email: lead.email, full_name: lead.full_name, avatar_seed: lead.avatar_seed } : null,
    issues,
    relations,
  };
}

/** A database cell as the card draws it, like the table does. */
function previewCell(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  createdAt: string | undefined,
  names: ReadonlyMap<string, string>,
): DatabasePreviewCell {
  if (property.type === "checkbox") return { kind: "checkbox", checked: value === true };
  if (property.type === "created_at") return createdAt ? { kind: "date", value: createdAt } : { kind: "text", text: "" };
  if (property.type === "date") return typeof value === "string" && value ? { kind: "date", value } : { kind: "text", text: "" };
  if (property.type === "select" || property.type === "multi_select") {
    const ids = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
    const options = ids.flatMap((optionId) => {
      const option = property.options?.find((candidate) => candidate.id === optionId);
      return option ? [{ name: option.name, color: option.color }] : [];
    });
    return { kind: "options", options, single: property.type === "select" };
  }
  return { kind: "text", text: databaseValueText(value, names, property) };
}

/**
 * A page's card. `getPage` checks the reader's access and leaves trashed pages
 * out. A database reads only the rows the card shows, and counts the rest:
 * never the project's whole page list, which a large wiki would decode on
 * every hover.
 */
async function pagePreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const read = await getPage(id, userId);
  if (!read.ok) return null;
  const page = read.page;
  const database = page.database_schema != null;
  const columns = ((page.database_schema ?? []) as DatabaseProperty[]).slice(0, DATABASE_PREVIEW_COLUMNS);
  const children = () => service.from("pages")
    .select("id, project_id, title, icon, property_values, created_at, deleted_at, encrypted_content, encryption_version",
      { count: "exact" })
    .eq("project_id", page.project_id).eq("parent_id", id).is("deleted_at", null)
    .order("position").limit(DATABASE_PREVIEW_ROWS);
  const [project, markdown, entries] = await Promise.all([
    previewProject(page.project_id, userId, service),
    database ? Promise.resolve("") : pageBodyToMarkdownServer((page.content as JSONContent | null) ?? null),
    database
      ? children().then(async ({ data, count }) => ({
          total: count ?? 0,
          rows: await Promise.all(((data ?? []) as Row[]).map((row) => decodePageProjection(row, userId))),
        }))
      : Promise.resolve({ total: 0, rows: [] as Row[] }),
  ]);
  if (!project) return null;
  const rows = entries.rows.map((row) => ({
    title: typeof row.title === "string" ? row.title : "",
    icon: typeof row.icon === "string" && row.icon ? row.icon : null,
    values: (row.property_values ?? {}) as Record<string, DatabaseValue>,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
  }));
  // People cells name their members, as the table does.
  const people = [...new Set(rows.flatMap((row) => columns.flatMap((property) =>
    property.type === "people" && Array.isArray(row.values[property.id]) ? row.values[property.id] as string[] : [])))];
  const users = people.length ? await fetchAuthUsersById(service, people) : new Map();
  const names = new Map(people.map((userId) => [userId, displayName(toNamed(users.get(userId)), "User")]));
  return {
    type: "page",
    project,
    title: page.title,
    icon: page.icon,
    updatedAt: page.updated_at ?? null,
    excerpt: database ? "" : cutExcerpt(markdown),
    database: database
      ? {
          titleName: page.database_title_name?.trim() || null,
          columns: columns.map((property) => ({ name: property.name, type: property.type })),
          rows: rows.map((row) => ({
            title: row.title,
            icon: row.icon,
            cells: columns.map((property) => previewCell(property, row.values[property.id], row.createdAt, names)),
          })),
          total: entries.total,
        }
      : null,
  };
}

async function projectPreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const [project, owner, rows] = await Promise.all([
    previewProject(id, userId, service),
    service.from("projects").select("owner_id").eq("id", id).maybeSingle()
      .then(({ data }) => (data?.owner_id as string | undefined) ?? null),
    service.from("project_members").select("user_id, role").eq("project_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => (data ?? []) as Array<{ user_id: string; role: string }>),
  ]);
  if (!project || !owner) return null;
  const everyone = [
    { userId: owner, role: "owner" as const },
    ...rows.filter((row) => row.user_id !== owner)
      .map((row) => ({ userId: row.user_id, role: memberRoleFromRow(row.role) })),
  ];
  const shown = everyone.slice(0, PROJECT_PREVIEW_MEMBERS);
  const ids = shown.map((member) => member.userId);
  const [users, seeds] = await Promise.all([fetchAuthUsersById(service, ids), fetchAvatarSeeds(service, ids)]);
  return {
    type: "project",
    project,
    members: shown.map((member) => ({
      ...member,
      name: displayName(toNamed(users.get(member.userId)), "User"),
      avatarSeed: seeds.get(member.userId) ?? member.userId,
    })),
    memberCount: everyone.length,
  };
}

async function memberPreview(
  userId: string,
  memberId: string,
  surfaceProject: string | null,
  service: SupabaseClient,
): Promise<MentionPreview | null> {
  const [users, seeds] = await Promise.all([
    fetchAuthUsersById(service, [memberId]),
    fetchAvatarSeeds(service, [memberId]),
  ]);
  const user = users.get(memberId);
  if (!user) return null;
  const named = toNamed(user);
  // Their role where the mention is read; a surface without a project (or
  // one they are not in) falls back to a project both share.
  const [memberRows, ownedRows] = await Promise.all([
    service.from("project_members").select("project_id").eq("user_id", memberId)
      .order("created_at", { ascending: true })
      .then(({ data }) => (data ?? []) as Array<{ project_id: string }>),
    service.from("projects").select("id").eq("owner_id", memberId).is("deleted_at", null)
      .order("created_at", { ascending: true })
      .then(({ data }) => (data ?? []) as Array<{ id: string }>),
  ]);
  const theirs = [...ownedRows.map((row) => String(row.id)), ...memberRows.map((row) => String(row.project_id))];
  const shared = await accessibleProjectIds(userId, theirs);
  const projectId = surfaceProject && shared.has(surfaceProject)
    ? surfaceProject
    : theirs.find((id) => shared.has(id)) ?? null;
  let membership = null;
  if (projectId) {
    const [member, project] = await Promise.all([
      projectMember(projectId, memberId, service),
      previewProject(projectId, userId, service),
    ]);
    if (member && project) membership = { projectName: project.name, role: member.role, joinedAt: member.joined_at };
  }
  return {
    type: "member",
    name: displayName(named, "User"),
    email: named.email,
    avatarSeed: seeds.get(memberId) ?? memberId,
    membership,
  };
}

async function routinePreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const found = await getRoutineForUser(id, userId);
  if (!found) return null;
  const project = await previewProject(found.routine.project_id, userId, service);
  if (!project) return null;
  return {
    type: "routine",
    project,
    title: found.routine.title,
    excerpt: cutExcerpt(found.routine.prompt),
    enabled: found.routine.enabled,
    nextRunAt: found.routine.next_run_at,
  };
}

async function cyclePreview(userId: string, id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  // A cycle is personal: only its owner reads it.
  const { data } = await service.from("cycles").select("id, start_date, end_date")
    .eq("user_id", userId).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: rows } = await issueStore(service, userId).select("project_id, status, effort")
    .eq("cycle_id", id).is("deleted_at", null);
  const found = (rows ?? []) as Row[];
  const allowed = await accessibleProjectIds(userId, [...new Set(found.map((row) => String(row.project_id)))]);
  return {
    type: "cycle",
    startDate: String(data.start_date),
    endDate: String(data.end_date),
    issues: found.filter((row) => allowed.has(String(row.project_id))).map((row) => ({
      status: row.status as IssueStatus, effort: (row.effort as IssueEffort | null) ?? null,
    })),
  };
}

async function pullRequestPreview(id: string, service: SupabaseClient): Promise<MentionPreview | null> {
  const [found] = await findPullRequestsWithProjects([id], service);
  if (!found) return null;
  const pr = found.pullRequest;
  return {
    type: "pull_request",
    number: pr.number,
    title: pr.title?.trim() || null,
    state: pr.state,
    repository: pr.repo_full_name,
    headBranch: pr.head_branch,
    baseBranch: pr.base_branch,
    author: pr.author_login ? { login: pr.author_login, avatarUrl: pr.author_avatar_url } : null,
    openedAt: pr.opened_at,
    mergedAt: pr.merged_at,
  };
}

async function mcpPreview(userId: string, id: string): Promise<MentionPreview | null> {
  const connection = await getMcpConnection(userId, id).catch(() => null);
  if (!connection) return null;
  const auth = connection.auth_mode === "oauth" ? "oauth" : connection.token_encrypted ? "token" : "none";
  return {
    type: "mcp",
    id,
    name: connection.name,
    service: mcpPresetForUrl(connection.url)?.id ?? null,
    enabled: connection.enabled,
    auth,
    connected: auth === "oauth" ? !!connection.oauth_connected : true,
  };
}

async function skillPreview(folder: string, projectId: string | null): Promise<MentionPreview | null> {
  if (!projectId) return null;
  // Read from the repository, like the menu that offered it.
  const skills = await listProjectRepositorySkills(projectId).catch(() => []);
  const summary = skills.find((skill) => skill.path.split("/").at(-2) === folder);
  if (!summary) return null;
  const loaded = await loadProjectRepositorySkills(projectId, [summary.path]).catch(() => null);
  return {
    type: "skill",
    name: summary.name,
    description: summary.description || null,
    excerpt: cutExcerpt(loaded?.[0]?.content ?? ""),
  };
}
