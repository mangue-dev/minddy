import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  ALL_ISSUES_KEY,
  ALL_ISSUE_RELATIONS_KEY,
  ALL_MEMBERS_KEY,
  ALL_STATS_KEY,
  GLOBAL_BOARD_KEY,
  GLOBAL_BOARD_PREREQUISITE_KEYS,
  GLOBAL_VIEWS_KEY,
  HOME_BRIEF_KEY,
  HOME_SUMMARY_KEY,
  PROJECTS_KEY,
  SEARCH_INDEX_KEY,
  SMART_ASSIGN_WARNINGS_KEY,
  TRIAGE_COUNTS_KEY,
  categoriesKey,
  integrationsKey,
  issueRelationsKey,
  issuesKey,
  membersKey,
  objectivesKey,
  projectBoardKeys,
  statsKey,
  viewsKey,
} from "./query-keys";
import { keysForProjectEvent, keysForUserEvent, projectScopeKeys, USER_SCOPE_KEYS, type BroadcastChange } from "./realtime-keys";
import { projectPreparationQueries } from "./use-prefetch-project";

const PROJECT = "11111111-1111-4111-8111-111111111111";

const change = (table: string): BroadcastChange => ({
  operation: "UPDATE",
  table,
  schema: "public",
  record: null,
  old_record: null,
});

const matchesPrefix = (prefix: QueryKey, key: QueryKey) => prefix.every((part, index) => part === key[index]);

describe("query keys", () => {
  // Persisted caches are restored under these exact keys: a changed value
  // orphans them on every device and silences realtime invalidation.
  it("keep their persisted shapes", () => {
    expect({
      allIssues: ALL_ISSUES_KEY,
      issues: issuesKey("p"),
      allIssueRelations: ALL_ISSUE_RELATIONS_KEY,
      issueRelations: issueRelationsKey("p"),
      objectives: objectivesKey("p"),
      categories: categoriesKey("p"),
      allMembers: ALL_MEMBERS_KEY,
      members: membersKey("p"),
      integrations: integrationsKey("p"),
      views: viewsKey("p"),
      globalViews: GLOBAL_VIEWS_KEY,
      projects: PROJECTS_KEY,
      globalBoard: GLOBAL_BOARD_KEY,
      homeSummary: HOME_SUMMARY_KEY,
      homeBrief: HOME_BRIEF_KEY,
      searchIndex: SEARCH_INDEX_KEY,
      smartAssignWarnings: SMART_ASSIGN_WARNINGS_KEY,
      triageCounts: TRIAGE_COUNTS_KEY,
      allStats: ALL_STATS_KEY,
      stats: statsKey("Europe/Paris"),
    }).toEqual({
      allIssues: ["issues"],
      issues: ["issues", "p"],
      allIssueRelations: ["issue-relations"],
      issueRelations: ["issue-relations", "p"],
      objectives: ["objectives", "p"],
      categories: ["categories", "p"],
      allMembers: ["members"],
      members: ["members", "p"],
      integrations: ["integrations", "p"],
      views: ["views", "p"],
      globalViews: ["views", "global"],
      projects: ["projects"],
      globalBoard: ["me", "board"],
      homeSummary: ["me", "summary"],
      homeBrief: ["me", "home-brief"],
      searchIndex: ["me", "search-index"],
      smartAssignWarnings: ["me", "smart-assign-warnings"],
      triageCounts: ["me", "triage-counts"],
      allStats: ["stats"],
      stats: ["stats", "Europe/Paris"],
    });
  });

  it("prefetch exactly the project board's prerequisites", () => {
    const keys = projectPreparationQueries(new QueryClient(), PROJECT).map((options) => options.queryKey);
    expect(keys).toEqual(expect.arrayContaining([...projectBoardKeys(PROJECT)]));
    expect(keys).toHaveLength(projectBoardKeys(PROJECT).length);
  });

  it("catch up every board prerequisite after a dropped connection", () => {
    // Integrations are not broadcast (keysForProjectEvent has no case for
    // them), so a missed event cannot leave them behind.
    for (const key of projectBoardKeys(PROJECT).filter(([family]) => family !== "integrations")) {
      expect(projectScopeKeys(PROJECT).some((prefix) => matchesPrefix(prefix, key)), String(key[0])).toBe(true);
    }
    for (const key of GLOBAL_BOARD_PREREQUISITE_KEYS) {
      expect(USER_SCOPE_KEYS.some((prefix) => matchesPrefix(prefix, key)), key.join("/")).toBe(true);
    }
  });

  it.each([
    ["issues", issuesKey(PROJECT)],
    ["issues", GLOBAL_BOARD_KEY],
    ["issue_relations", issueRelationsKey(PROJECT)],
    ["objectives", objectivesKey(PROJECT)],
    ["categories", categoriesKey(PROJECT)],
    ["categories", issuesKey(PROJECT)],
    ["project_members", membersKey(PROJECT)],
    ["views", viewsKey(PROJECT)],
  ] as const)("routes a project %s event to %j", (table, key) => {
    expect(keysForProjectEvent(change(table), PROJECT).map((invalidation) => invalidation.key)).toContainEqual(key);
  });

  it("routes global view and project list events to the keys their hooks read", () => {
    expect(keysForUserEvent(change("views")).map(({ key }) => key)).toEqual([GLOBAL_VIEWS_KEY]);
    expect(keysForUserEvent(change("project_members")).map(({ key }) => key)).toEqual(
      expect.arrayContaining([PROJECTS_KEY, GLOBAL_BOARD_KEY, HOME_SUMMARY_KEY, TRIAGE_COUNTS_KEY, SEARCH_INDEX_KEY]),
    );
  });
});
