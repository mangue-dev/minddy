import { issueIdentifier } from "./issue-constants";
import { promptRelations, type IssuePromptInput, type PromptRelationSource } from "./issue-prompt";
import type { Category, Issue, Member, Objective, Project } from "./types";

/** What a kanban card needs from its own project. */
export interface BoardProject {
  id: string;
  key: string;
  members: Map<string, Member>;
  categories: Map<string, Category>;
  objectives: Map<string, Objective>;
  /** The origin chip each card shows, on a board spanning several projects. */
  chip?: Project;
}

/**
 * The projects a kanban board's cards come from. A project board is the
 * one-project case; `/all` lists every project it shows.
 */
export interface BoardProjects {
  byId: ReadonlyMap<string, BoardProject>;
  /** The project of a project board; null on a board spanning projects. */
  projectId: string | null;
}

export function singleProjectBoard(
  project: Pick<Project, "id" | "key">,
  members: readonly Member[],
  categories: readonly Category[],
  objectives: readonly Objective[],
): BoardProjects {
  const entry: BoardProject = {
    id: project.id,
    key: project.key,
    members: new Map(members.map((m) => [m.user_id, m])),
    categories: new Map(categories.map((c) => [c.id, c])),
    objectives: new Map(objectives.map((o) => [o.id, o])),
  };
  return { byId: new Map([[project.id, entry]]), projectId: project.id };
}

export function multiProjectBoard(
  projects: Iterable<Project>,
  membersByProject: Readonly<Record<string, readonly Member[]>>,
  categoriesByProject: Readonly<Record<string, readonly Category[]>>,
  objectivesByProject: Readonly<Record<string, readonly Objective[]>>,
): BoardProjects {
  const byId = new Map<string, BoardProject>();
  for (const project of projects) {
    byId.set(project.id, {
      id: project.id,
      key: project.key,
      members: new Map((membersByProject[project.id] ?? []).map((m) => [m.user_id, m])),
      categories: new Map((categoriesByProject[project.id] ?? []).map((c) => [c.id, c])),
      objectives: new Map((objectivesByProject[project.id] ?? []).map((o) => [o.id, o])),
      chip: project,
    });
  }
  return { byId, projectId: null };
}

/** Every objective of the board's projects, by id. */
export function boardObjectives(projects: BoardProjects): Map<string, Objective> {
  const out = new Map<string, Objective>();
  for (const project of projects.byId.values()) {
    for (const [id, objective] of project.objectives) out.set(id, objective);
  }
  return out;
}

/**
 * The part of a selection the viewer may edit: project readers (MIN-693)
 * browse their cards but never select them, so the bulk actions only ever
 * write to issues the server accepts.
 */
export function writableSelection(
  ids: Iterable<string>,
  issueById: ReadonlyMap<string, Pick<Issue, "project_id">>,
  canWriteIn: (projectId: string) => boolean,
): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const issue = issueById.get(id);
    if (issue && canWriteIn(issue.project_id)) out.add(id);
  }
  return out;
}

/** The one project a whole selection belongs to, or null when it spans several. */
export function selectionProjectId(
  selected: ReadonlyArray<Pick<Issue, "project_id">>,
): string | null {
  if (selected.length === 0) return null;
  const first = selected[0].project_id;
  return selected.every((issue) => issue.project_id === first) ? first : null;
}

/**
 * The assignees a selection can take: the members of every project it spans,
 * each listed once. Someone outside one of those projects cannot be assigned
 * its issue.
 */
export function sharedMembers(
  selected: ReadonlyArray<Pick<Issue, "project_id">>,
  projects: BoardProjects,
): Member[] {
  const projectIds = [...new Set(selected.map((issue) => issue.project_id))];
  if (projectIds.length === 0) return [];
  const [first, ...others] = projectIds.map(
    (projectId) => projects.byId.get(projectId)?.members ?? new Map<string, Member>(),
  );
  return [...first.values()].filter((member) =>
    others.every((members) => members.has(member.user_id)),
  );
}

/**
 * One selected issue's part of the combined prompt (MIN-539), resolved in the
 * issue's own project: its categories in the project's order (MIN-760), and
 * each relation end by its own project's key. An end the board does not hold
 * reads as an empty identifier.
 */
export function boardPromptInput(
  issue: Issue,
  projects: BoardProjects,
  relations: readonly PromptRelationSource[] | undefined,
  issueById: ReadonlyMap<string, Issue>,
): IssuePromptInput {
  const project = projects.byId.get(issue.project_id);
  return {
    issue,
    projectId: issue.project_id,
    projectKey: project?.key ?? "",
    resourceCount: issue.resource_count,
    categories: [...(project?.categories.values() ?? [])]
      .filter((category) => issue.category_ids.includes(category.id))
      .map((category) => category.name),
    relations: promptRelations(relations, {
      identifierOf: (otherId) => {
        const other = issueById.get(otherId);
        const key = other ? projects.byId.get(other.project_id)?.key : undefined;
        return other && key ? issueIdentifier(key, other.number) : "";
      },
      titleOf: (otherId) =>
        project?.objectives.get(otherId)?.name ?? issueById.get(otherId)?.title ?? "",
    }),
  };
}
