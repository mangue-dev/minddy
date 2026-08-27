import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { isRepoProviderId, type RepoProviderId } from "@/lib/repo-providers";
import { forgeFor } from "./forge";
import { issueRefFromPr, parseIssueRef } from "./pr-ingest-core";
import type { PullRequestRef } from "./pr";

/**
 * Data access from table `pull_requests` (MIN-143) — the passage point
 * UNIQUE, in service key: ingestion is server (webhooks + scans),
 * the table has no write policy.
 *
 * A PR is identified by `(provider, repo_full_name, number)`: it is a fact
 * of the REPOSITORY, not of a project. Access is resolved on READ, by joining
 * `project_git_links` — two projects that link the same repository see the same
 * line.
 */

export type PullRequestState = "draft" | "open" | "merged" | "closed";

export interface PullRequestRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  url: string | null;
  title: string | null;
  state: PullRequestState;
  author_login: string | null;
  author_avatar_url: string | null;
  head_branch: string | null;
  base_branch: string | null;
  head_sha: string | null;
  issue_id: string | null;
  opened_at: string | null;
  merged_at: string | null;
  updated_at: string;
  synced_at: string;
}

/** Columns served everywhere (the table has nothing else to hide). */
const PR_COLUMNS =
  "id, provider, repo_full_name, number, url, title, state, author_login, author_avatar_url, " +
  "head_branch, base_branch, head_sha, issue_id, opened_at, merged_at, updated_at, synced_at";

/** Provider stored → known id, with GitHub fallback (same contract as `getRepoProvider`). */
export function rowProvider(row: { provider: string }): RepoProviderId {
  return isRepoProviderId(row.provider) ? row.provider : "github";
}

/**
 * Minddy status of a PR read at the forge. Both forges speak in
 * `state` + booleans; minddy has only four words, and the order matters: merged
 * trumps closed (GitHub closes a PR by merging it), and a draft
 * is only a draft as long as it's open.
 */
export function prStateFromRef(ref: PullRequestRef): PullRequestState {
  if (ref.merged) return "merged";
  if (ref.state === "closed") return "closed";
  return ref.draft ? "draft" : "open";
}

export interface PullRequestUpsert {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
  state: PullRequestState;
  url?: string | null;
  title?: string | null;
  authorLogin?: string | null;
  authorAvatarUrl?: string | null;
  headBranch?: string | null;
  baseBranch?: string | null;
  headSha?: string | null;
  openedAt?: string | null;
  mergedAt?: string | null;
  /** Last update CHEZ LA FORGE — sorting the list (default: now). */
  updatedAt?: string | null;
  /**
   * Attachment to the ticket. `undefined` = DO NOT TOUCH: a webhook that does not resolve the ticket must not delete an already established attachment (by
   * a run, or by a scan that had read a branch since deleted).
   */
  issueId?: string | null;
}

export interface PullRequestUpsertOutcome {
  row: PullRequestRow;
  /** False means an equal or newer forge observation was already stored. */
  applied: boolean;
}

/**
 * DB line of an upsert. A key ABSENT from the payload does not enter the PostgREST
 * `ON CONFLICT DO UPDATE SET`: `undefined` therefore means "I don't know", and `null` "it's empty". The distinction carries all the weight here,
 * because webhooks don't carry the same fields as the API: a
 * `merge_request` GitLab doesn't say who the author is, and overwriting the login read by
 * a previous scan would flash the list on each event.
 *
 * Only `provider` / `repo_full_name` / `number` (identity) and `state` * are mandatory — you don't update a PR without knowing what state it is in.
 */
function toRow(input: PullRequestUpsert): Record<string, unknown> {
  const row: Record<string, unknown> = {
    provider: input.provider,
    repo_full_name: input.repoFullName,
    number: input.number,
    state: input.state,
    // The forge gives its date on almost all paths; failing that, writing
    // IS the most recent event known from this PR.
    updated_at: input.updatedAt ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
  const optional: Array<[string, unknown]> = [
    ["url", input.url],
    ["title", input.title],
    ["author_login", input.authorLogin],
    ["author_avatar_url", input.authorAvatarUrl],
    ["head_branch", input.headBranch],
    ["base_branch", input.baseBranch],
    ["head_sha", input.headSha],
    ["opened_at", input.openedAt],
    ["merged_at", input.mergedAt],
    ["issue_id", input.issueId],
  ];
  for (const [column, value] of optional) {
    if (value !== undefined) row[column] = value;
  }
  return row;
}

/**
 * Creates or updates ONE pull request. Returns the current row, or null if
 * the write failed (best-effort: ingestion should never drop a
 * webhook).
 */
export async function upsertPullRequestWithOutcome(
  input: PullRequestUpsert,
): Promise<PullRequestUpsertOutcome | null> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("upsert_pull_request_monotonic", {
    p_values: toRow(input),
  });
  if (error) {
    console.error("[pull-requests] upsert failed:", error.message);
    return null;
  }
  const result = data as { row?: PullRequestRow; applied?: boolean } | null;
  return result?.row
    ? { row: result.row, applied: result.applied === true }
    : null;
}

export async function upsertPullRequest(
  input: PullRequestUpsert,
): Promise<PullRequestRow | null> {
  return (await upsertPullRequestWithOutcome(input))?.row ?? null;
}

/** Pull request par son id minddy (service client — l'appelant authentifie). */
export async function findPullRequest(
  prId: string,
): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("id", prId)
    .maybeSingle();
  return (data as PullRequestRow | null) ?? null;
}

/** Pull request by its natural key — the resolution run → PR of the facades. */
export async function findPullRequestByNumber(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  number: number;
}): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName)
    .eq("number", opts.number)
    .maybeSingle();
  return (data as PullRequestRow | null) ?? null;
}

/**
 * PR of a repository whose HEAD is this commit. Serves the direct CI (MIN-161):
 * a `status` GitHub event only carries an SHA, never a PR number, and the
 * `check_suite` only lists PRs whose base is in the same repository (the
 * forks are not there). The SHA is still there.
 *
 * Several possible lines: two open PRs can share a head (one
 * same branch proposed on two bases).
 */
export async function findPullRequestsByHeadSha(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  headSha: string;
}): Promise<PullRequestRow[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName)
    .eq("head_sha", opts.headSha);
  return (data ?? []) as unknown as PullRequestRow[];
}

export interface RepoRef {
  provider: RepoProviderId;
  repoFullName: string;
}

/** Connection line → repository, or null if it is incomplete (unknown provider,
 repository never chosen: the connection exists before the repository is designated). */
function repoFromLink(data: unknown): RepoRef | null {
  const row = data as {
    provider: string;
    repo_full_name: string | null;
  } | null;
  if (!row?.repo_full_name || !isRepoProviderId(row.provider)) return null;
  return { provider: row.provider, repoFullName: row.repo_full_name };
}

/**
 * Project-related repository — at most ONE (`project_git_links.project_id` is
 * unique). The opposite is multiple: several projects can link the same
 * repository, which `projectsForRepo` serves.
 */
export async function repoForProject(
  projectId: string,
): Promise<RepoRef | null> {
  const { data } = await getServiceClient()
    .from("project_git_links")
    .select("provider, repo_full_name")
    .eq("project_id", projectId)
    .maybeSingle();
  return repoFromLink(data);
}

/** Deposit (provider + full name) of a run, via its link — or null. */
export async function repoForRun(run: {
  repo_link_id: string | null;
  project_id: string;
}): Promise<RepoRef | null> {
  // `repo_link_id` is ON DELETE SET NULL: after an unlink, the run keeps its PR
  // but no longer its link — we then fall back on the CURRENT link of the project.
  if (!run.repo_link_id) return repoForProject(run.project_id);
  const { data } = await getServiceClient()
    .from("project_git_links")
    .select("provider, repo_full_name")
    .eq("id", run.repo_link_id)
    .maybeSingle();
  return repoFromLink(data);
}

/**
 * PR of a run, created on the fly if it is still missing.
 *
 * The normal path creates it on opening (`registerPr`) then keeps it updated by
 * webhook. The catch-up still counts: without a deployed webhook (dev), or for
 * a run prior to this table for which the backfill was unable to do anything, the facades
 * `agent-runs/[runId]/pr/*` must serve the PR all the same — otherwise a
 * deep-link `?run=` would fall on a 404 for a PR which exists.
 */
export async function resolvePrForRun(run: {
  repo_link_id: string | null;
  project_id: string;
  issue_id: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: PullRequestState | null;
  branch_name: string | null;
  base_branch: string | null;
}): Promise<PullRequestRow | null> {
  if (run.pr_number == null) return null;
  const repo = await repoForRun(run);
  if (!repo) return null;
  const existing = await findPullRequestByNumber({
    ...repo,
    number: run.pr_number,
  });
  if (existing) return existing;
  return upsertPullRequest({
    provider: repo.provider,
    repoFullName: repo.repoFullName,
    number: run.pr_number,
    state: run.pr_state ?? "open",
    url: run.pr_url,
    headBranch: run.branch_name,
    baseBranch: run.base_branch,
    issueId: run.issue_id,
  });
}

/**
 * Attaches a STILL FREE PR to a ticket. Makes false if it was no longer false.
 *
 * The `is("issue_id", null)` is not a stylistic precaution: it is what makes
 * the manual gesture (MIN-163) ATOMIC. Checking it before writing would leave a window between the read and the write — two tabs, two tickets, and the second write would overwrite the first without anyone seeing. The base
 * decides, the caller reads the verdict.
 *
 * The meaning is deliberately UNIQUE: we bind, we do not unbind. The link is
 * definitive on the product side, and a detachment would in any case be reestablished at the
 * next scan if the branch still carries the reference to the ticket.
 */
export async function setPullRequestIssue(
  prId: string,
  issueId: string,
): Promise<
  | "linked"
  | "already"
  | "pr_already_linked"
  | "issue_already_linked"
  | "pr_not_found"
> {
  const service = getServiceClient();
  const { data, error } = await service.rpc(
    "link_pull_request_to_issue_atomic",
    {
      p_pr_id: prId,
      p_issue_id: issueId,
    },
  );
  if (error) {
    console.error("[pull-requests] issue link failed:", error.message);
    return "pr_not_found";
  }
  return data as
    | "linked"
    | "already"
    | "pr_already_linked"
    | "issue_already_linked"
    | "pr_not_found";
}

/**
 * Does this ticket already have a LIVING PR (draft or open)?
 *
 * This is the uniqueness of "one ticket, one PR" such that it stands up. A unique
 * index on `issue_id` would be wrong: a ticket legitimately chains multiple
 * PRs over runs (measured — tickets carry three terminal PRs), and it
 * would cause the scan to BATCH upload to a repository where two open branches
 * cite the same ticket. What doesn't make sense is TWO PRs in flight
 * on the same ticket: this is what we refuse at the time of the manual gesture.
 */
export async function hasLivePullRequest(issueId: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select("id")
    .eq("issue_id", issueId)
    .in("state", ["draft", "open"])
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * THE pull request of a ticket, in the sense of "the one we are talking about".
 *
 * A ticket can carry several over the runs (see `hasLivePullRequest`),
 * but only one is alive at a time: that's the one we want, and failing that the
 * most recently hit at the forge. The order is the same as that of the page
 * Pull Requests, so that "this PR" means the same thing on both sides.
 *
 * No filter on the origin: a human PR, a PR attached by convention
 * and a PR opened by the agent are the same entity since MIN-143. The caller
 * has already verified their access to the ticket.
 */
export async function findPullRequestForIssue(
  issueId: string,
): Promise<PullRequestRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("pull_requests")
    .select(PR_COLUMNS)
    .eq("issue_id", issueId)
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as PullRequestRow[];
  return (
    rows.find((r) => r.state === "draft" || r.state === "open") ??
    rows[0] ??
    null
  );
}

// ── Rattachement au ticket ───────────────────────────────────────────────────

export interface RepoProject {
  id: string;
  key: string;
}

/** Projects (id + key) that link to this repository — the scope of valid references. */
export async function projectsForRepo(
  provider: RepoProviderId,
  repoFullName: string,
): Promise<RepoProject[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("project_git_links")
    .select("project:projects(id, key)")
    .eq("provider", provider)
    .eq("repo_full_name", repoFullName);
  // Embedded to-one relationship: object at runtime, cast via unknown (see Supabase).
  return ((data ?? []) as unknown as Array<{ project: RepoProject | null }>)
    .map((r) => r.project)
    .filter((p): p is RepoProject => !!p);
}

/**
 * Ticket that a PR declares to carry, resolved to id minddy — or null.
 *
 * Two steps: the CONVENTION says which identifier (`pr-ingest-core`, pure and
 * tested), the base says if it exists. A ticket in the trash counts as
 * non-existent: reattaching it would resurrect a PR that has already disappeared from the list.
 */
export async function resolveIssueForPr(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  branch?: string | null;
  title?: string | null;
  body?: string | null;
  /** Projects from the repository, when the caller already has them (scan: once and for all). */
  projects?: RepoProject[];
}): Promise<string | null> {
  const projects =
    opts.projects ?? (await projectsForRepo(opts.provider, opts.repoFullName));
  if (projects.length === 0) return null;
  const ref = issueRefFromPr({
    projectKeys: projects.map((p) => p.key),
    branch: opts.branch,
    title: opts.title,
    body: opts.body,
  });
  if (!ref) return null;
  const parsed = parseIssueRef(ref);
  if (!parsed) return null;
  const project = projects.find((p) => p.key === parsed.key);
  if (!project) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("issues")
    .select("id")
    .eq("project_id", project.id)
    .eq("number", parsed.number)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Scanning a repository ─────────────────────────── ───────────────────────────

/**
 * Replays, on A PR whose state has drifted, what the webhook would have done if it
 * had arrived (MIN-164): `agent_runs.pr_state` failed, ticket status aligned.
 *
 * Exactly the shape of the two receivers — the runs first, the Human PR
 * then — because it’s the same fact that we catch up with. What we DO NOT replay
 * NOT: activity and notifications. We notice a state, we did not see the
 * gesture; writing “so and so merged” hours after the fact, without knowing who or
 * when, would say more than what we know.
 *
 * `applyForgePrToIssue` arrives by DYNAMIC import: `pr-activity` imports this
 * module (`findPullRequestByNumber`), and the static cycle would break the evaluation
 * order. Scanning is not a hot path — it only goes to the
 * catch-up.
 */
async function reconcileDriftedPr(
  provider: RepoProviderId,
  repoFullName: string,
  number: number,
  state: PullRequestState,
): Promise<void> {
  try {
    const { syncPrState } = await import("./runs");
    const runs = await syncPrState({
      repoFullName,
      prNumber: number,
      prState: state,
      provider,
    });
    const currentState =
      runs[0]?.prState ??
      (
        await findPullRequestByNumber({ provider, repoFullName, number })
      )?.state ??
      state;
    if (runs.length === 0) {
      const { applyForgePrToIssue } = await import("./pr-activity");
      await applyForgePrToIssue({
        provider,
        repoFullName,
        prNumber: number,
        prState: currentState,
        actionType: null,
        accountId: null,
        login: null,
      });
      return;
    }
    const { syncIssueStatusFromPr } = await import("./issue-status-sync");
    for (const run of runs) {
      // `issueId` null = run notebook (MIN-84): no issue to align.
      if (run.createdBy && run.issueId) {
        await syncIssueStatusFromPr({
          issueId: run.issueId,
          actorId: run.createdBy,
          prState: currentState,
        });
      }
    }
  } catch (err) {
    console.error(
      "[pull-requests] state reconcile failed:",
      (err as Error).message,
    );
  }
}

/**
 * Lazy scan freshness window. A lost webhook should not
 * leave the list false forever; a cron that would scan ALL related
 * repositories would be expensive for this one catch-up alone. We therefore resynchronize at the
 * reading, and not more often than that.
 */
export const REPO_SYNC_TTL_MS = 15 * 60_000;

export interface RepoSyncState {
  provider: string;
  repo_full_name: string;
  synced_at: string;
  truncated: boolean;
}

/** Scan status of requested repositories (key `provider:repo`). */
export async function readRepoSyncStates(
  repos: Array<{ provider: RepoProviderId; repoFullName: string }>,
): Promise<Map<string, RepoSyncState>> {
  if (repos.length === 0) return new Map();
  const service = getServiceClient();
  const { data } = await service
    .from("pull_request_syncs")
    .select("provider, repo_full_name, synced_at, truncated")
    .in("repo_full_name", [...new Set(repos.map((r) => r.repoFullName))]);
  const map = new Map<string, RepoSyncState>();
  for (const row of (data ?? []) as RepoSyncState[]) {
    map.set(`${row.provider}:${row.repo_full_name}`, row);
  }
  return map;
}

export function repoSyncKey(
  provider: RepoProviderId,
  repoFullName: string,
): string {
  return `${provider}:${repoFullName}`;
}

/** Does the repository need a catch-up? (never swept, or too old). */
export function needsRepoSync(state: RepoSyncState | undefined): boolean {
  if (!state) return true;
  return Date.now() - Date.parse(state.synced_at) > REPO_SYNC_TTL_MS;
}

/**
 * Buffers a scan without being able to read anything (forge failed, token refused).
 * Without this buffer, a failed deposit would restart a scan on EACH display
 * of the page; with it, it tries again in the next window.
 */
export async function stampRepoSync(
  provider: RepoProviderId,
  repoFullName: string,
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("pull_request_syncs")
    .upsert(
      {
        provider,
        repo_full_name: repoFullName,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "provider,repo_full_name" },
    );
  if (error) console.error("[pull-requests] sync stamp failed:", error.message);
}

/**
 * Scans ALL PRs from a deposit at the forge and updates them in minddy.
 *
 * This is the catch-up: when linking the deposit (you need a starting point)
 * and when reading when `synced_at` is old. There is no cron - the webhook
 * is the normal path, this one only fixes its holes.
 *
 * Attaching to the ticket NEVER overwrites a link already placed: a run could have placed it, or a previous scan may have read it on a branch since deleted.
 * We therefore only resolve the PRs which do not have one.
 *
 * It also RECONCILIATES (MIN-164): until now it failed `pull_requests.state` and
 * stopped there — a merge whose webhook was lost left the run and the
 * false ticket FOREVER, including after passing the net supposed to repair the
 *. The states which have moved since the last reading therefore leave
 * in `syncPrState` and the status of the ticket.
 *
 * Returns the number of PRs seen and if the pagination has been cut. Best effort:
 * a broken forge should not cause the page to fall.
 */
export async function syncRepoPullRequests(opts: {
  provider: RepoProviderId;
  repoFullName: string;
  token: string;
}): Promise<{ count: number; truncated: boolean }> {
  const forge = forgeFor(opts.provider);
  const { pulls, truncated } = await forge.listPullRequests({
    token: opts.token,
    repoFullName: opts.repoFullName,
  });

  const service = getServiceClient();
  const { data: existing } = await service
    .from("pull_requests")
    .select("number, issue_id, state")
    .eq("provider", opts.provider)
    .eq("repo_full_name", opts.repoFullName);
  const knownByNumber = new Map(
    (
      (existing ?? []) as Array<{
        number: number;
        issue_id: string | null;
        state: PullRequestState;
      }>
    ).map((r) => [r.number, r]),
  );

  const projects = await projectsForRepo(opts.provider, opts.repoFullName);
  const observations: Array<{
    input: PullRequestUpsert;
    before: { state: PullRequestState } | undefined;
    state: PullRequestState;
    at: number;
  }> = [];
  /** PR whose state has CHANGED since the last reading — the hole of a webhook.
 `at` = its last activity at the forge, the replay key (see below). */
  const drifted: Array<{
    number: number;
    state: PullRequestState;
    at: number;
  }> = [];
  for (const pull of pulls) {
    const before = knownByNumber.get(pull.number);
    const state = prStateFromRef(pull);
    // Only lines ALREADY known: on the first scan of a repository that we
    // just linked, everything is new, and nothing happened there before
    // minddy ne doit bouger un ticket.
    const issueId =
      before?.issue_id ??
      (await resolveIssueForPr({
        provider: opts.provider,
        repoFullName: opts.repoFullName,
        branch: pull.head,
        title: pull.title,
        body: pull.body,
        projects,
      }));
    observations.push({
      input: {
        provider: opts.provider,
        repoFullName: opts.repoFullName,
        number: pull.number,
        state,
        url: pull.url,
        title: pull.title ?? null,
        authorLogin: pull.user?.login ?? null,
        authorAvatarUrl: pull.user?.avatar_url ?? null,
        headBranch: pull.head ?? null,
        baseBranch: pull.base ?? null,
        headSha: pull.headSha ?? null,
        openedAt: pull.createdAt ?? null,
        mergedAt: pull.mergedAt ?? null,
        updatedAt: pull.updatedAt ?? pull.createdAt,
        issueId,
      },
      before,
      state,
      at: Date.parse(pull.updatedAt ?? pull.createdAt ?? "") || 0,
    });
  }

  // A sweep and a webhook can observe the same PR in opposite orders. Route
  // both through the same monotonic database primitive and only reconcile an
  // issue when this observation actually won.
  const applied = await Promise.all(
    observations.map(async (observation) => ({
      observation,
      outcome: await upsertPullRequestWithOutcome(observation.input),
    })),
  );
  for (const { observation, outcome } of applied) {
    if (
      outcome?.applied &&
      observation.before &&
      observation.before.state !== observation.state
    ) {
      drifted.push({
        number: observation.input.number,
        state: observation.state,
        at: observation.at,
      });
    }
  }

  const { error: stampError } = await service.from("pull_request_syncs").upsert(
    {
      provider: opts.provider,
      repo_full_name: opts.repoFullName,
      synced_at: new Date().toISOString(),
      truncated,
    },
    { onConflict: "provider,repo_full_name" },
  );
  if (stampError)
    console.error("[pull-requests] sweep stamp failed:", stampError.message);

  // AFTER writing the lines: reconciliation rereads the PR by its key
  // natural, and must find the up-to-date state there, not the one we just
  // to correct. Nothing to report in activity (`actionType: null`) — we repair a
  // state, we did not see the gesture that produced it.
  //
  // From OLDEST to most recent: several PRs of the SAME ticket can have
  // derived together (a ticket legitimately chains several over the course of
  // runs — cf. `hasLivePullRequest`), and each rewrites the status of this ticket.
  // The last replay wins: without order, it's a coincidence, and the two forges
  // list by DECREASING freshness — so the oldest had the last
  // word, and a ticket whose last PR was merged returned to “to do”
  // on a PR refused before. We play again in the order in which the states moved.
  drifted.sort((a, b) => a.at - b.at);
  for (const { number, state } of drifted) {
    await reconcileDriftedPr(opts.provider, opts.repoFullName, number, state);
  }

  return { count: pulls.length, truncated };
}

// ── Reading for the user ─────────────────────── ────────────────────────

/** Linked repository, seen by a user — carries the project that gives access. */
export interface VisibleRepo {
  provider: RepoProviderId;
  repoFullName: string;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  };
}

/**
 * Repositories that this user can see, via the AUTHENTICATED client (the RLS of
 * `project_git_links` does the filtering — no manual project filtering). A repository linked
 * by several of its projects appears once per project: it is the caller
 * who decides which one to display, and `resolveRepoCloneTargetForRepo` which one to use
 * to mint a token.
 */
export async function listVisibleRepos(
  supabase: SupabaseClient,
): Promise<VisibleRepo[]> {
  const { data } = await supabase
    .from("project_git_links")
    .select(
      "provider, repo_full_name, project:projects(id, key, name, icon_url, orb_seed, deleted_at)",
    );
  return (
    (data ?? []) as unknown as Array<{
      provider: string;
      repo_full_name: string | null;
      project: (VisibleRepo["project"] & { deleted_at: string | null }) | null;
    }>
  )
    .filter(
      (r) =>
        !!r.repo_full_name &&
        !!r.project &&
        // Project at CORBEILLE (MIN-133): its line remains in base, and the policy
        // `projects_select` only looks at access — so it came back from the
        // join like any other. The page then listed the sweaters
        // requests from a project that the user no longer sees anywhere
        // elsewhere, under a header bearing his name. Restoring it brings them back.
        !r.project.deleted_at &&
        isRepoProviderId(r.provider),
    )
    .map((r) => ({
      provider: r.provider as RepoProviderId,
      repoFullName: r.repo_full_name as string,
      project: r.project as VisibleRepo["project"],
    }));
}

/** A PR of the list, with its ticket and the project of this ticket (RLS joins). */
export interface PullRequestWithIssue extends PullRequestRow {
  issue: {
    id: string;
    number: number;
    title: string;
    project_id: string;
  } | null;
}

/**
 * PR of the `repos` repositories, the freshest at the top, via the AUTHENTICATED client.
 *
 * The `(provider, repo_full_name)` filter is applied in TWO stages: the query
 * expands on the repository names, then the caller crosses the pair exact. A
 * `or()` PostgREST on pairs would be fragile (the repository names leave
 * in the filter grammar) to only avoid a case of inter-forge homonymy.
 */
export async function listPullRequestsForUser(
  supabase: SupabaseClient,
  repos: VisibleRepo[],
  opts?: { limit?: number; states?: PullRequestState[] },
): Promise<PullRequestWithIssue[]> {
  if (repos.length === 0) return [];
  const names = [...new Set(repos.map((r) => r.repoFullName))];
  const pairs = new Set(
    repos.map((r) => repoSyncKey(r.provider, r.repoFullName)),
  );

  let query = supabase
    .from("pull_requests")
    .select(`${PR_COLUMNS}, issue:issues(id, number, title, project_id)`)
    .in("repo_full_name", names)
    .order("updated_at", { ascending: false });
  if (opts?.states) query = query.in("state", opts.states);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PullRequestWithIssue[]).filter((row) =>
    pairs.has(`${row.provider}:${row.repo_full_name}`),
  );
}

/**
 * Count visible pull requests without loading rows, issue joins, run
 * decorations, or triggering a forge synchronization. The app shell uses this
 * for its badge on every route; the full list remains exclusive to the Pull
 * Requests page.
 */
export async function countPullRequestsForUser(
  supabase: SupabaseClient,
  repos: VisibleRepo[],
  states: PullRequestState[],
): Promise<number> {
  const namesByProvider = new Map<string, Set<string>>();
  for (const repo of repos) {
    const names = namesByProvider.get(repo.provider) ?? new Set<string>();
    names.add(repo.repoFullName);
    namesByProvider.set(repo.provider, names);
  }

  const counts = await Promise.all(
    [...namesByProvider.entries()].map(async ([provider, names]) => {
      const { count, error } = await supabase
        .from("pull_requests")
        .select("id", { count: "exact", head: true })
        .eq("provider", provider)
        .in("repo_full_name", [...names])
        .in("state", states);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }),
  );
  return counts.reduce((total, count) => total + count, 0);
}
