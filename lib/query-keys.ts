/**
 * React Query keys read or written by more than one module.
 *
 * The values are a persisted contract: the cache is written to localStorage
 * (lib/query-provider.tsx) and restored under these exact keys, and the
 * realtime bridge (lib/realtime-keys.ts) invalidates by them. A changed value
 * orphans every persisted cache and silently stops invalidation; tests in
 * lib/query-keys.test.ts pin the shapes.
 *
 * A key read and written by its owning hook only stays in that hook.
 */

/** Prefix of every project's issue list. */
export const ALL_ISSUES_KEY = ["issues"] as const;
export const issuesKey = (projectId: string) => ["issues", projectId] as const;
/** Prefix of every project's relation list. */
export const ALL_ISSUE_RELATIONS_KEY = ["issue-relations"] as const;
export const issueRelationsKey = (projectId: string) => ["issue-relations", projectId] as const;
export const objectivesKey = (projectId: string) => ["objectives", projectId] as const;
export const categoriesKey = (projectId: string) => ["categories", projectId] as const;
/** Prefix of every project's member list. */
export const ALL_MEMBERS_KEY = ["members"] as const;
export const membersKey = (projectId: string) => ["members", projectId] as const;
export const integrationsKey = (projectId: string) => ["integrations", projectId] as const;

/** Saved views of one project, or the project-less views under `"global"`. */
export const viewsKey = (scope: string) => ["views", scope] as const;
export const GLOBAL_VIEWS_KEY = viewsKey("global");

export const PROJECTS_KEY = ["projects"] as const;

/** The aggregate cross-project board (MIN-29). */
export const GLOBAL_BOARD_KEY = ["me", "board"] as const;
export const HOME_SUMMARY_KEY = ["me", "summary"] as const;
export const HOME_BRIEF_KEY = ["me", "home-brief"] as const;
export const SEARCH_INDEX_KEY = ["me", "search-index"] as const;
export const SMART_ASSIGN_WARNINGS_KEY = ["me", "smart-assign-warnings"] as const;
export const TRIAGE_COUNTS_KEY = ["me", "triage-counts"] as const;

/** Prefix of the statistics, keyed per time zone. */
export const ALL_STATS_KEY = ["stats"] as const;
export const statsKey = (timeZone: string) => ["stats", timeZone] as const;

/** What a project board needs loaded before it renders. */
export const projectBoardKeys = (projectId: string) => [
  issuesKey(projectId),
  membersKey(projectId),
  categoriesKey(projectId),
  objectivesKey(projectId),
  integrationsKey(projectId),
  issueRelationsKey(projectId),
  viewsKey(projectId),
] as const;

/** What the cross-project board needs loaded before it renders. */
export const GLOBAL_BOARD_PREREQUISITE_KEYS = [GLOBAL_BOARD_KEY, GLOBAL_VIEWS_KEY, PROJECTS_KEY] as const;

export const sameQueryKey = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((part, index) => part === b[index]);
