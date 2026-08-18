/**
 * Standardization of CI checks of a PR/MR (MIN-138) — pure, without I/O or
 * `server-only`, therefore testable in node (same pattern as `branch-cleanup-core.ts`
 * and `mr-position.ts`). Callers (`pr.ts`, `mr.ts`) make network calls
 * and pass the raw objects here.
 *
 * The common vocabulary is reduced to four states, because that's all that
 * the display can say: in progress, successful, failed, neutral. The nuances of both
 * forges (`cancelled`, `timed_out`, `skipped`, `manual`…) s'y replient.
 */

export type CheckState = "pending" | "success" | "failure" | "neutral";

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  /** Check page at the forge, when it exists. */
  url: string | null;
  /** The integration that produced the check — “GitHub Actions”, “Socket
      Security »… `null` when the NAME of the check already carries it (the commit statuses
      s'appellent « Vercel – ui »). */
  appName: string | null;
  /** Its logo, served by the forge. `null` = no logo to display (GitLab does not
      exposes none): the UI falls back to the forge icon. */
  appAvatarUrl: string | null;
  /** The result in one line, as the forge formulates it (“Deployment has
      completed”). Empty for most GitHub Actions jobs: they are not
      tell only by their condition and duration. */
  description: string | null;
  /** Duration measured, when the forge gives the two limits. */
  durationMs: number | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /**
   * Aggregated state: a failure trumps all, then a check in progress, otherwise
   * successful. `null` = no check at all (deposit without CI) — distinct from
   * `checks: null` on the API side, which means “we could not read”.
   */
  state: CheckState | null;
  /** Non-blocking checks (successful OR neutral) — the `n` of “n/m passed”. */
  passing: number;
  total: number;
}

/** Display order: what requires action first. */
const SEVERITY: Record<CheckState, number> = {
  failure: 0,
  pending: 1,
  neutral: 2,
  success: 3,
};

/** The GitHub App behind a check run (GitHub Actions, Vercel, Socket Security, etc.). */
export interface RawCheckApp {
  id?: number;
  slug?: string;
  name?: string;
  owner?: { avatar_url?: string | null } | null;
}

/** Check run GitHub (`GET /commits/{sha}/check-runs`, `filter=latest` by default). */
export interface RawCheckRun {
  name?: string;
  status?: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion?: string | null; // success | failure | neutral | cancelled | timed_out | action_required | skipped | stale
  html_url?: string | null;
  details_url?: string | null;
  app?: RawCheckApp | null;
  /** The result as the App formulates it. `title` is empty on GitHub jobs
      Actions, filled by integrations that have something to say. */
  output?: { title?: string | null } | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/** Commit status GitHub (`GET /commits/{sha}/status`). */
export interface RawCommitStatus {
  context?: string;
  state?: string; // pending | success | failure | error
  target_url?: string | null;
  description?: string | null;
  /** Integration logo, already served by GitHub in its canonical form
      (`https://avatars.githubusercontent.com/in/{app_id}` — measured). */
  avatar_url?: string | null;
  creator?: { avatar_url?: string | null } | null;
}

/** Pipeline GitLab (`GET /merge_requests/:iid/pipelines`). */
export interface RawPipeline {
  id?: number;
  status?: string; // created | waiting_for_resource | preparing | pending | running | success | failed | canceled | skipped | manual | scheduled
  web_url?: string | null;
  ref?: string | null;
  /** Name of the pipeline when the project gives one (`workflow:name`). */
  name?: string | null;
}

/** Marque du CI de GitLab — un nom propre, donc jamais traduit. */
const GITLAB_CI_APP = "GitLab CI/CD";

/**
 * Logo of a GitHub App. This is NOT `app.owner.avatar_url`: this one is
 * the avatar of the owner ACCOUNT (the `github` organization for GitHub Actions,
 * therefore the octocat instead of the Actions logo). The App logo lives under `/in/{id}`,
 * and this is exactly the URL that GitHub itself serves in the `avatar_url` of
 * commit statuses (measured: `in/8329` for Vercel). `s=48` because we display it
 * en 20 px : sans lui, GitHub renvoie l'original en 460 px.
 */
function githubAppAvatar(app: RawCheckApp | null | undefined): string | null {
  if (app?.id) return `https://avatars.githubusercontent.com/in/${app.id}?s=48`;
  return app?.owner?.avatar_url ?? null;
}

/**
 * Duration between two ISO terminals. `null` as soon as one is missing or the gap is
 * not positive: GitHub dates a skipped job with a `completed_at` PRIOR to its
 * `started_at` (measured), and “0 s” means nothing more than nothing.
 */
function elapsedMs(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** Non-empty string, stripped of spaces — otherwise `null`. */
function text(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function checkRunState(run: RawCheckRun): CheckState {
  // As long as the run is not `completed`, it has no conclusion: in progress.
  if (run.status !== "completed") return "pending";
  switch (run.conclusion) {
    case "success":
      return "success";
    case "neutral":
    case "skipped":
      return "neutral";
    default:
      // `failure`, `cancelled`, `timed_out`, `action_required`, `stale`, and one
      // unknown conclusion: none of this is a success, and a state
      // invented by GitHub tomorrow should not be considered green.
      return "failure";
  }
}

function commitStatusState(status: RawCommitStatus): CheckState {
  switch (status.state) {
    case "success":
      return "success";
    case "pending":
      return "pending";
    default:
      // `failure` and `error`.
      return "failure";
  }
}

function pipelineState(status: string | undefined): CheckState {
  switch (status) {
    case "success":
      return "success";
    case "skipped":
    case "manual":
      // A manual job not triggered is not a failure: it awaits a decision
      // humaine que minddy ne prend pas.
      return "neutral";
    case "failed":
    case "canceled":
      return "failure";
    default:
      // created / waiting_for_resource / preparing / pending / running / scheduled.
      return "pending";
  }
}

function summarize(checks: PullRequestCheck[]): ChecksSummary {
  const sorted = [...checks].sort(
    (a, b) => SEVERITY[a.state] - SEVERITY[b.state] || a.name.localeCompare(b.name),
  );
  const state: CheckState | null = sorted.some((c) => c.state === "failure")
    ? "failure"
    : sorted.some((c) => c.state === "pending")
      ? "pending"
      : sorted.length > 0
        ? "success"
        : null;
  return {
    checks: sorted,
    state,
    // Neutral counts as non-blocking: “5/5” on a CI whose two jobs are
    // sautéed tells the truth, “3/5” would make it seem like two failures.
    passing: sorted.filter((c) => c.state === "success" || c.state === "neutral").length,
    total: sorted.length,
  };
}

/**
 * GitHub: merges check runs (GitHub Actions & co) and commit statuses
 * (the historical API, still used by many integrations). Same name
 * can happen on both sides — the check run wins, it carries the highest state
 * detailed and this is what GitHub displays.
 */
export function summarizeGithubChecks(
  runs: RawCheckRun[],
  statuses: RawCommitStatus[],
): ChecksSummary {
  const byName = new Map<string, PullRequestCheck>();
  for (const s of statuses) {
    const name = text(s.context);
    if (!name) continue;
    byName.set(name, {
      name,
      state: commitStatusState(s),
      url: s.target_url ?? null,
      // The context of a status already NAMES its integration (“Vercel – ui”):
      // repeating the login of the bot that installed it (“vercel[bot]”) adds nothing.
      appName: null,
      appAvatarUrl: s.avatar_url ?? s.creator?.avatar_url ?? null,
      description: text(s.description),
      // The historical API only dates the status installation, not the work behind it.
      durationMs: null,
    });
  }
  for (const r of runs) {
    const name = text(r.name);
    if (!name) continue;
    byName.set(name, {
      name,
      state: checkRunState(r),
      url: r.html_url ?? r.details_url ?? null,
      appName: text(r.app?.name),
      appAvatarUrl: githubAppAvatar(r.app),
      description: text(r.output?.title),
      durationMs: elapsedMs(r.started_at, r.completed_at),
    });
  }
  return summarize([...byName.values()]);
}

/**
 * GitLab: an MR carries a LIST of pipelines, from the most recent to the oldest,
 * and only the last one by ref describes the current state — keep the previous ones
 * would drag out the failure of an already corrected push indefinitely. The name displayed is
 * the pipeline number: GitLab does not present the details by job here (it would be necessary
 * a call by pipeline, for a view that minddy does not unfold).
 *
 * No logo by integration on this side — at GitLab, the CI IS GitLab: the UI
 * falls on the forge icon. No duration either: this list does not give
 * than `created_at`/`updated_at`, and their gap is not the duration of the pipeline
 * (a raise extends it afterwards).
 */
export function summarizeGitlabPipelines(pipelines: RawPipeline[]): ChecksSummary {
  const latest = pipelines[0];
  if (!latest?.id) return summarize([]);
  return summarize([
    {
      name: `#${latest.id}`,
      state: pipelineState(latest.status),
      url: latest.web_url ?? null,
      appName: GITLAB_CI_APP,
      appAvatarUrl: null,
      // In the absence of a one-line result, what the pipeline ran:
      // its name when the project gives one, otherwise the branch.
      description: text(latest.name) ?? text(latest.ref),
      durationMs: null,
    },
  ]);
}
