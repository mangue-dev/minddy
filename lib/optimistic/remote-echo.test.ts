import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  GLOBAL_BOARD_KEY,
  applyPendingBoard,
  applyPendingIssues,
  applyPendingObjectives,
  issueWrites,
  objectiveWrites,
} from "./issue-writes";
import { adoptRemoteRow, remoteEchoOf, type RemoteChange } from "./remote-echo";
import { SEARCH_INDEX_KEY } from "../use-search-index";
import type {
  GlobalBoardResponse,
  Issue,
  Objective,
  SearchIndexResponse,
} from "../types";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE = "33333333-3333-4333-8333-333333333333";

/** The `issues` line such that realtime.broadcast_changes() broadcasts it. */
function issueRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ISSUE,
    project_id: PROJECT,
    number: 42,
    title: "Créé par Numo",
    description: null,
    plan: null,
    status: "todo",
    priority: "none",
    effort: null,
    assignee_id: null,
    objective_id: null,
    parent_id: null,
    duplicate_of_id: null,
    due_date: null,
    recurrence: null,
    recurrence_series_id: null,
    position: 1000,
    created_by: null,
    created_at: "2026-08-05T10:00:00+00:00",
    updated_at: "2026-08-05T10:00:00+00:00",
    completed_at: null,
    cycle_id: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

/** The `objectives` line, same thing. */
function objectiveRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: OBJECTIVE,
    project_id: PROJECT,
    name: "Objectif de Numo",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    color: "amber",
    created_at: "2026-08-05T10:00:00+00:00",
    updated_at: "2026-08-05T10:00:00+00:00",
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function change(
  operation: RemoteChange["operation"],
  table: string,
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null = null
): RemoteChange {
  return { operation, table, record, old_record: oldRecord };
}

const cachedIssue = (overrides: Partial<Issue> = {}): Issue => ({
  ...(issueRow() as unknown as Issue),
  category_ids: [],
  ...overrides,
});
const cachedObjective = (overrides: Partial<Objective> = {}): Objective => ({
  ...(objectiveRow() as unknown as Objective),
  ...overrides,
});

function emptyBoard(
  issues: Issue[] = [],
  objectives: Objective[] = []
): GlobalBoardResponse {
  return {
    issues,
    members: {},
    categories: {},
    objectives: objectives.length ? { [PROJECT]: objectives } : {},
    integrations: {},
    relations: [],
    cycles: { enabled: false, current: null, upcoming: [], past: [] },
  };
}

function emptyIndex(): SearchIndexResponse {
  return {
    issues: [],
    objectives: [],
    pages: [],
    members: {},
    categories: {},
    truncated: false,
  };
}

function seed(client: QueryClient, issues: Issue[] = [], objectives: Objective[] = []) {
  client.setQueryData(["issues", PROJECT], issues);
  client.setQueryData(["objectives", PROJECT], objectives);
  client.setQueryData(GLOBAL_BOARD_KEY, emptyBoard(issues, objectives));
  client.setQueryData(SEARCH_INDEX_KEY, emptyIndex());
}

const boardIssues = (client: QueryClient) =>
  client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.issues ?? [];
const projectIssues = (client: QueryClient) =>
  client.getQueryData<Issue[]>(["issues", PROJECT]) ?? [];
const boardObjectives = (client: QueryClient) =>
  client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.objectives[PROJECT] ?? [];
const projectObjectives = (client: QueryClient) =>
  client.getQueryData<Objective[]>(["objectives", PROJECT]) ?? [];
const index = (client: QueryClient) =>
  client.getQueryData<SearchIndexResponse>(SEARCH_INDEX_KEY) ?? emptyIndex();

const adopt = (client: QueryClient, c: RemoteChange) =>
  adoptRemoteRow(client, PROJECT, remoteEchoOf(c));

let client: QueryClient;

beforeEach(() => {
  issueWrites.reset();
  objectiveWrites.reset();
  client = new QueryClient();
});

describe("remoteEchoOf", () => {
  it("lit la ligne d'une création", () => {
    expect(remoteEchoOf(change("INSERT", "issues", issueRow()))).toEqual({
      entity: "issue",
      kind: "upsert",
      id: ISSUE,
      row: issueRow(),
    });
    expect(remoteEchoOf(change("INSERT", "objectives", objectiveRow()))).toEqual({
      entity: "objective",
      kind: "upsert",
      id: OBJECTIVE,
      row: objectiveRow(),
    });
  });

  it("traite un corbeillage (UPDATE deleted_at) comme un retrait", () => {
    const trashed = issueRow({ deleted_at: "2026-08-05T11:00:00+00:00" });
    expect(remoteEchoOf(change("UPDATE", "issues", trashed, issueRow()))).toEqual({
      entity: "issue",
      kind: "remove",
      id: ISSUE,
    });
    const gone = objectiveRow({ deleted_at: "2026-08-05T11:00:00+00:00" });
    expect(remoteEchoOf(change("UPDATE", "objectives", gone, objectiveRow()))).toEqual({
      entity: "objective",
      kind: "remove",
      id: OBJECTIVE,
    });
  });

  it("treats a permanent purge as a removal", () => {
    expect(remoteEchoOf(change("DELETE", "issues", null, issueRow()))).toEqual({
      entity: "issue",
      kind: "remove",
      id: ISSUE,
    });
  });

  it("lit les deux sens d'un lien de catégorie", () => {
    const link = { issue_id: ISSUE, category_id: "cat-1" };
    expect(remoteEchoOf(change("INSERT", "issue_categories", link))).toEqual({
      entity: "issue",
      kind: "category",
      id: ISSUE,
      categoryId: "cat-1",
      linked: true,
    });
    expect(remoteEchoOf(change("DELETE", "issue_categories", null, link))).toEqual({
      entity: "issue",
      kind: "category",
      id: ISSUE,
      categoryId: "cat-1",
      linked: false,
    });
  });

  it("ignore les tables qui ne portent ni ticket ni objectif", () => {
    expect(remoteEchoOf(change("INSERT", "comments", { issue_id: ISSUE }))).toBeNull();
    expect(remoteEchoOf(change("INSERT", "issues", { project_id: PROJECT }))).toBeNull();
  });
});

describe("adoptRemoteRow — tickets", () => {
  it("puts a ticket created elsewhere in both caches without a request", () => {
    seed(client);

    adopt(client, change("INSERT", "issues", issueRow()));

    expect(boardIssues(client).map((i) => i.id)).toEqual([ISSUE]);
    expect(projectIssues(client).map((i) => i.id)).toEqual([ISSUE]);
    // The aggregates that the line does not carry have a safe value.
    expect(boardIssues(client)[0].category_ids).toEqual([]);
  });

  it("does not create a cache that did not exist", () => {
    adopt(client, change("INSERT", "issues", issueRow()));

    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toBeUndefined();
    expect(client.getQueryData(["issues", PROJECT])).toBeUndefined();
    expect(client.getQueryData(SEARCH_INDEX_KEY)).toBeUndefined();
  });

  it("n'ajoute jamais deux fois le même ticket", () => {
    seed(client);

    adopt(client, change("INSERT", "issues", issueRow()));
    adopt(client, change("INSERT", "issues", issueRow()));

    expect(boardIssues(client)).toHaveLength(1);
    expect(index(client).issues).toHaveLength(1);
  });

  it("completes a known ticket without clearing its categories", () => {
    seed(client, [cachedIssue({ category_ids: ["cat-1"] })]);

    adopt(client, change("UPDATE", "issues", issueRow({ status: "in_progress" })));

    expect(boardIssues(client)[0].status).toBe("in_progress");
    expect(boardIssues(client)[0].category_ids).toEqual(["cat-1"]);
  });

  it("removes a trashed ticket from both caches", () => {
    seed(client, [cachedIssue()]);

    adopt(
      client,
      change(
        "UPDATE",
        "issues",
        issueRow({ deleted_at: "2026-08-05T11:00:00+00:00" }),
        issueRow()
      )
    );

    expect(boardIssues(client)).toEqual([]);
    expect(projectIssues(client)).toEqual([]);
  });

  it("adds and removes a category link on a known ticket", () => {
    seed(client, [cachedIssue()]);
    const link = { issue_id: ISSUE, category_id: "cat-1" };

    adopt(client, change("INSERT", "issue_categories", link));
    expect(boardIssues(client)[0].category_ids).toEqual(["cat-1"]);

    adopt(client, change("DELETE", "issue_categories", null, link));
    expect(boardIssues(client)[0].category_ids).toEqual([]);
  });

  it("ignore un lien dont le ticket n'est pas (encore) en cache", () => {
    seed(client);

    adopt(
      client,
      change("INSERT", "issue_categories", { issue_id: ISSUE, category_id: "cat-1" })
    );

    expect(boardIssues(client)).toEqual([]);
  });
});

describe("adoptRemoteRow — objectifs", () => {
  it("pose l'objectif créé ailleurs dans ses deux caches", () => {
    seed(client);

    adopt(client, change("INSERT", "objectives", objectiveRow()));

    expect(projectObjectives(client).map((o) => o.id)).toEqual([OBJECTIVE]);
    expect(boardObjectives(client).map((o) => o.id)).toEqual([OBJECTIVE]);
  });

  it("adopte le PREMIER objectif d'un projet, dont le board n'a pas de tranche", () => {
    seed(client);
    client.setQueryData(GLOBAL_BOARD_KEY, emptyBoard()); // objectives: {}

    adopt(client, change("INSERT", "objectives", objectiveRow()));

    expect(boardObjectives(client).map((o) => o.id)).toEqual([OBJECTIVE]);
  });

  it("renames a known objective in both caches", () => {
    seed(client, [], [cachedObjective()]);

    adopt(client, change("UPDATE", "objectives", objectiveRow({ name: "Renommé" })));

    expect(projectObjectives(client)[0].name).toBe("Renommé");
    expect(boardObjectives(client)[0].name).toBe("Renommé");
  });

  it("removes a trashed objective from both caches", () => {
    seed(client, [], [cachedObjective()]);

    adopt(
      client,
      change(
        "UPDATE",
        "objectives",
        objectiveRow({ deleted_at: "2026-08-05T11:00:00+00:00" }),
        objectiveRow()
      )
    );

    expect(projectObjectives(client)).toEqual([]);
    expect(boardObjectives(client)).toEqual([]);
  });
});

describe("adoptRemoteRow — index de la palette", () => {
  it("indexes a ticket created elsewhere without carrying along its description or plan", () => {
    seed(client);

    adopt(
      client,
      change("INSERT", "issues", issueRow({ plan: "# 400 lignes", description: "…" }))
    );

    expect(index(client).issues).toEqual([
      {
        id: ISSUE,
        project_id: PROJECT,
        number: 42,
        title: "Créé par Numo",
        status: "todo",
        priority: "none",
        effort: null,
        assignee_id: null,
        objective_id: null,
        updated_at: "2026-08-05T10:00:00+00:00",
      },
    ]);
  });

  it("updates an already indexed row instead of duplicating it", () => {
    seed(client, [cachedIssue()]);
    adopt(client, change("INSERT", "issues", issueRow()));

    adopt(client, change("UPDATE", "issues", issueRow({ title: "Retitré" })));

    expect(index(client).issues).toHaveLength(1);
    expect(index(client).issues[0].title).toBe("Retitré");
  });

  it("removes a ticket and objective deleted elsewhere from the index", () => {
    seed(client, [cachedIssue()], [cachedObjective()]);
    adopt(client, change("INSERT", "issues", issueRow()));
    adopt(client, change("UPDATE", "objectives", objectiveRow()));
    expect(index(client).issues).toHaveLength(1);
    expect(index(client).objectives).toHaveLength(1);

    adopt(client, change("DELETE", "issues", null, issueRow()));
    adopt(client, change("DELETE", "objectives", null, objectiveRow()));

    expect(index(client).issues).toEqual([]);
    expect(index(client).objectives).toEqual([]);
  });

  it("indexes an objective with only the columns of a palette row", () => {
    seed(client);

    adopt(client, change("INSERT", "objectives", objectiveRow({ description: "…" })));

    expect(index(client).objectives).toEqual([
      {
        id: OBJECTIVE,
        project_id: PROJECT,
        name: "Objectif de Numo",
        status: "planned",
        color: "amber",
      },
    ]);
  });
});

// The point that holds everything else together: an answer sent BEFORE broadcast
// and arrival after it must not make what we have just disappear
// to adopt (MIN-156). The queryFn all pass their response through this register.
describe("adoptRemoteRow — handling a late response", () => {
  it("keeps a ticket created elsewhere", () => {
    seed(client);
    const startedAt = Date.now() - 1_000; // request part before broadcast

    adopt(client, change("INSERT", "issues", issueRow()));

    expect(applyPendingBoard(emptyBoard(), startedAt).issues.map((i) => i.id)).toEqual([
      ISSUE,
    ]);
    expect(applyPendingIssues([], startedAt, PROJECT).map((i) => i.id)).toEqual([ISSUE]);
  });

  it("keeps an objective created elsewhere", () => {
    seed(client);
    const startedAt = Date.now() - 1_000;

    adopt(client, change("INSERT", "objectives", objectiveRow()));

    expect(applyPendingObjectives([], startedAt, PROJECT).map((o) => o.id)).toEqual([
      OBJECTIVE,
    ]);
  });

  it("keeps a ticket removed elsewhere", () => {
    seed(client, [cachedIssue()]);
    const startedAt = Date.now() - 1_000;

    adopt(client, change("DELETE", "issues", null, issueRow()));

    expect(applyPendingBoard(emptyBoard([cachedIssue()]), startedAt).issues).toEqual([]);
  });

  it("allows responses sent AFTER adoption through", () => {
    seed(client);
    adopt(client, change("INSERT", "issues", issueRow()));
    const startedAt = Date.now() + 1;

    // The answer is then authoritative, including to say that the ticket still has
    // changed since.
    expect(applyPendingIssues([], startedAt, PROJECT)).toEqual([]);
  });

  it("n'inscrit aucune empreinte qui ferait passer l'écho pour le nôtre", () => {
    seed(client);
    const record = issueRow();

    adopt(client, change("INSERT", "issues", record));
    adopt(client, change("INSERT", "objectives", objectiveRow()));

    // Otherwise the bridge would skip the invalidation which reconciles categories,
    // attachments and derived views.
    expect(issueWrites.wasJustWritten(ISSUE, record)).toBe(false);
    expect(objectiveWrites.wasJustWritten(OBJECTIVE, objectiveRow())).toBe(false);
  });
});
