/**
 * What a git account has the right to do on a repository (MIN-144) — PURE logic,
 * readable from the payload of each forge, testable without a network.
 *
 * Three levels, and no more:
 * • `write` — merge, close, propose a draft PR, resolve a thread ;
 * • `read` — review, comment on the conversation, comment on a line, y
 * reply. This is NOT "connected": commenting on a line reads the hot PR to
 * (on the GitHub side, for its `commitId`), so you really need to know how to read
 * the repository ;
 * • `none` — 404 at the forge: the account does not see this repository.
 *
 * We do not model branch protection: it would cost permission
 * GitHub outside the scope, the forge refuses the merge on its own, and
 * `mergeableState === "blocked"` already says it in the UI.
 */

export type RepoCapability = "write" | "read" | "none";

/**
 * GitHub — `GET /repos/{owner}/{repo}` with the USER token. The
 * `permissions` object only exists on an authenticated response; a public repository read
 * without permission returns `push: false, pull: true` → `read`, which is
 * correct: you can comment on a public repository without being a contributor.
 *
 * `permissions` absent = unexpected response (or repository read without auth): we fall back to
 * on `read`, never on `write` — doubt does not give the right to merge.
 */
export function githubCapabilityFromRepo(json: unknown): RepoCapability {
  const permissions = (json as { permissions?: unknown } | null)?.permissions as
    | { push?: unknown; pull?: unknown; admin?: unknown; maintain?: unknown }
    | undefined;
  if (!permissions || typeof permissions !== "object") return "read";
  if (permissions.push === true || permissions.admin === true) return "write";
  return "read";
}

/**
 * GitLab — `GET /projects/:id`. The effective right is the MAX of direct
 * access to the project and inherited access from the group: a group Maintainer often has
 * no `project_access`, and reading only that one would downgrade it to `read`.
 *
 * GitLab thresholds: 30 = Developer (can push, comment, resolve a thread),
 * 20 = Reporter (read + comments). Below, nothing.
 */
const GITLAB_DEVELOPER = 30;
const GITLAB_REPORTER = 20;

export function gitlabCapabilityFromProject(json: unknown): RepoCapability {
  const permissions = (json as { permissions?: unknown } | null)?.permissions as
    | {
        project_access?: { access_level?: unknown } | null;
        group_access?: { access_level?: unknown } | null;
      }
    | undefined;
  const levelOf = (entry: { access_level?: unknown } | null | undefined): number =>
    typeof entry?.access_level === "number" ? entry.access_level : 0;
  const level = Math.max(
    levelOf(permissions?.project_access),
    levelOf(permissions?.group_access),
  );
  if (level >= GITLAB_DEVELOPER) return "write";
  if (level >= GITLAB_REPORTER) return "read";
  // `permissions` absent or empty: the project responded, so it is READABLE
  // (public, or visible without membership). You can comment there, not write there.
  return "read";
}
