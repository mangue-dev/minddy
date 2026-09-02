import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import { forgeFor, isForgeApiError, type MergeMethod } from "./forge";
import { AI_REVIEW_MAX_INLINE_COMMENTS } from "./tools";
import { resolvePrCommentAnchor, signReviewBody } from "./pr-tools";
import {
  needsRepoSync,
  readRepoSyncStates,
  repoSyncKey,
  syncRepoPullRequests,
  type PullRequestState,
} from "./pull-requests";

/**
 * Project pull requests, visible and actionable from an ordinary run (MIN-267).
 *
 * `pr-tools.ts` serves actions anchored to the current review. This family
 * serves project-wide pull-request discovery and actions from every anchor:
 *
 * - `list_pull_requests`: inventory read from `pull_requests`, not the forge. It
 *   matches the Pull Requests page and refreshes stale data lazily, so listing
 *   fifteen PRs does not cost fifteen API calls.
 * - `read_pull_request`: details for one PR from the forge. Per-file diffs are
 *   included only with `include_diff`, so a routine can scan fifteen headers
 *   without fetching fifteen diffs.
 * - write tools: conversation comment, inline comment, thread reply, review
 *   verdict, and state change including merge.
 *
 * ## How this changes the earlier policy
 *
 * Since MIN-141, `pr-tools.ts` follows “Numo gives an opinion; it does not hold
 * the gate”: none of its three writes submits a verdict to the forge, because an
 * App `APPROVE` could satisfy branch protection and `REQUEST_CHANGES` would block
 * the PR until a human dismissed it.
 *
 * **That rule does not apply here, by explicit product-owner decision**
 * (2026-08-10): `review_pull_request` submits a real verdict and
 * `set_pull_request_state` can merge. A routine may therefore approve and merge
 * without human intervention. Repository branch protections are the boundary;
 * minddy adds no further gate.
 *
 * Identity does not change: everything uses the installation token and therefore
 * the minddy account (see the identity table in `forge.ts`). That is deliberate:
 * a PR merged by a routine should not appear to have been merged by the person
 * who authored the routine months earlier.
 *
 * GitHub refuses self-review with 422 when the same account opened the PR. That
 * is normal for Numo PRs; `submitReview` falls back to publishing the verdict in
 * a comment and returns `published: "comment"`. The tool exposes this to the
 * model rather than implying that an approval occurred.
 */

export { PROJECT_PR_TOOL_NAMES } from "./platform-tool-names";

type ToolOutcome = { result: unknown; success: boolean };

/** Repository linked to the run project, with a fresh token. */
export interface ProjectRepoTarget {
  token: string;
  repoFullName: string;
  provider: RepoProviderId;
}

export interface ProjectPrToolContext {
  /** Run project, which scopes everything this tool family can see. */
  projectId: string;
  /**
   * Repository and token, resolved on every call because a turn can outlive the
   * installation token used to clone the repository. `null` means the project
   * has no linked repository; the tool reports that without throwing.
   */
  repo: () => Promise<ProjectRepoTarget | null>;
  /** Run model, included in the signature on Numo's writes. */
  model: string;
  /** Signature language inherited from the launcher. */
  locale: string;
  /**
   * Anchors created by this run. This is the same object used by review sessions
   * (`PrToolContext.inline`) and persisted by `execute.ts` in the checkpoint. The
   * limit is therefore five per run across all pull requests: fifteen inline
   * remarks are still noise whether they target one PR or five.
   */
  inline: { used: number };
  reserveInline?: () => Promise<number | null>;
  releaseInline?: () => Promise<number | null>;
}

// ── Limits of what we return to the model ───────────────────────────────────────

/** Comment body accepted — GitHub refuses beyond 65,536 characters. */
const MAX_BODY_LENGTH = 65_536;
/** Patch per file, when `include_diff` is requested (same ceiling as MCP). */
const MAX_PATCH_CHARS = 4_000;
/** Files listed by `read_pull_request` — beyond that, we say how many are missing. */
const MAX_FILES = 100;
/** Posts from the thread rendered, the most RECENT (one PR chatter has hundreds). */
const MAX_COMMENTS = 30;
/** Fils de review rendus. */
const MAX_THREADS = 40;
/** Body of a message delivered — enough to read it, not enough to drown out the context. */
const MAX_COMMENT_CHARS = 2_000;
/** Lines rendered by `list_pull_requests` (default 30). */
const MAX_LIST_LIMIT = 100;

const PR_STATES: PullRequestState[] = ["draft", "open", "merged", "closed"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

function cap(text: string | null | undefined, max: number): string | null {
  if (!text) return text ?? null;
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}

/** The PR number, required by all tools except the list. */
function prNumber(args: Record<string, unknown>): number | { error: string } {
  const n = int(args.pull_request);
  if (n == null || n < 1) {
    return {
      error:
        "pull_request must be the NUMBER of a pull request of this project's repository — the one list_pull_requests returns.",
    };
  }
  return n;
}

// ── Inventaire ──────────────────────────────────────────────────────────────

/**
 * Refreshes the list if it has aged — the SAME lazy scan as the page
 * Pull Requests (`needsRepoSync`, 15 mins). Best effort: a broken down forge makes
 * the list as it is in base, never an error. Without him, a routine
 * on Friday morning would read the state left by the last webhook received, and a
 * lost webhook would read as "nothing has moved".
 */
async function refreshIfStale(target: ProjectRepoTarget): Promise<void> {
  try {
    const states = await readRepoSyncStates([
      { provider: target.provider, repoFullName: target.repoFullName },
    ]);
    if (
      !needsRepoSync(
        states.get(repoSyncKey(target.provider, target.repoFullName)),
      )
    )
      return;
    await syncRepoPullRequests({
      provider: target.provider,
      repoFullName: target.repoFullName,
      token: target.token,
    });
  } catch (err) {
    console.error("[project-pr-tools] sweep failed:", (err as Error).message);
  }
}

interface ListedRow {
  number: number;
  title: string | null;
  state: PullRequestState;
  url: string | null;
  author_login: string | null;
  head_branch: string | null;
  base_branch: string | null;
  opened_at: string | null;
  merged_at: string | null;
  updated_at: string;
  issue: {
    number: number;
    title: string;
    project: { key: string } | null;
  } | null;
}

async function listPullRequests(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const target = await ctx.repo();
  if (!target) return noRepo();
  await refreshIfStale(target);

  const rawStates = Array.isArray(args.state)
    ? args.state.map(str)
    : str(args.state)
      ? [str(args.state)]
      : [];
  const states = rawStates.filter((s): s is PullRequestState =>
    (PR_STATES as string[]).includes(s),
  );
  if (rawStates.length > 0 && states.length === 0) {
    return {
      result: { error: `state must be one of: ${PR_STATES.join(", ")}.` },
      success: false,
    };
  }
  const author = str(args.author).replace(/^@/, "");
  const since = str(args.updated_since);
  if (since && Number.isNaN(Date.parse(since))) {
    return {
      result: {
        error:
          "updated_since must be a date the machine can read — '2026-08-03' or a full ISO timestamp.",
      },
      success: false,
    };
  }
  const limit = Math.min(Math.max(int(args.limit) ?? 30, 1), MAX_LIST_LIMIT);

  let query = getServiceClient()
    .from("pull_requests")
    .select(
      "number, title, state, url, author_login, head_branch, base_branch, opened_at, merged_at, updated_at, " +
        "issue:issues(number, title, project:projects(key))",
    )
    .eq("provider", target.provider)
    .eq("repo_full_name", target.repoFullName)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (states.length > 0) query = query.in("state", states);
  if (author) query = query.ilike("author_login", author);
  if (since) query = query.gte("updated_at", new Date(since).toISOString());

  const { data, error } = await query;
  if (error) return { result: { error: error.message }, success: false };

  const rows = (data ?? []) as unknown as ListedRow[];
  return {
    result: {
      repository: target.repoFullName,
      count: rows.length,
      // The list is LIMITED: say it, rather than leaving the conclusion “there you go
      // all the PRs of the week” on a window cut into the ceiling.
      truncated: rows.length === limit,
      pull_requests: rows.map((row) => ({
        number: row.number,
        title: row.title,
        state: row.state,
        author: row.author_login,
        head: row.head_branch,
        base: row.base_branch,
        url: row.url,
        opened_at: row.opened_at,
        merged_at: row.merged_at,
        updated_at: row.updated_at,
        issue: row.issue
          ? {
              identifier: row.issue.project
                ? `${row.issue.project.key}-${row.issue.number}`
                : null,
              title: row.issue.title,
            }
          : null,
      })),
    },
    success: true,
  };
}

// ── Detail ───────────────────────────────── ─────────────────────────────────

async function readPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };
  const includeDiff = args.include_diff === true;

  const pr = await forge.getPullRequest(call);
  // Everything else is BEST-EFFORT: a repository without CI, an App without permission
  // checks or a forge that does not have a review object should not prevent
  // read the pull request. `null` means “not readable”, never “nothing”.
  const [diff, reviewComments, reviewThreads, comments, reviews, checks] =
    await Promise.all([
      forge
        .listPullRequestFiles(call)
        .catch(() => ({ files: [], truncated: false })),
      forge.listPullRequestReviewComments(call).catch(() => []),
      forge.listReviewThreads(call).catch(() => []),
      forge.listPullRequestComments(call).catch(() => []),
      forge.listReviews(call).catch(() => null),
      pr.headSha
        ? forge.listChecks({ ...call, sha: pr.headSha }).catch(() => null)
        : null,
    ]);

  const threads = groupReviewThreads(reviewComments, reviewThreads);
  const files = diff.files.slice(0, MAX_FILES);

  return {
    result: {
      number: pr.number,
      url: pr.url,
      title: pr.title ?? null,
      body: cap(pr.body ?? null, MAX_COMMENT_CHARS),
      state: pr.merged ? "merged" : pr.state,
      draft: !!pr.draft,
      author: pr.user?.login ?? null,
      head: pr.head ?? null,
      base: pr.base ?? null,
      created_at: pr.createdAt ?? null,
      updated_at: pr.updatedAt ?? null,
      merged_at: pr.mergedAt ?? null,
      // `mergeable: null` means UNKNOWN at GitHub (the calculation is
      // asynchronous), not “no”: make it as is rather than boolean.
      mergeable: pr.mergeable ?? null,
      mergeable_state: pr.mergeableState ?? null,
      repository: target.repoFullName,
      checks: checks
        ? {
            state: checks.state,
            passing: checks.passing,
            total: checks.total,
            failing: checks.checks
              .filter((c) => c.state === "failure")
              .map((c) => ({
                name: c.name,
                url: c.url,
                description: c.description,
              })),
          }
        : null,
      reviews: reviews
        ? {
            approvals: reviews.approvals,
            changes_requested: reviews.changesRequested,
          }
        : null,
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(includeDiff
          ? { patch: cap(f.patch ?? null, MAX_PATCH_CHARS) }
          : {}),
      })),
      files_truncated: diff.truncated || diff.files.length > files.length,
      // Without the diff, say it: a model that reads a list of files without
      // patch must know that the content is obtained, not that it does not exist.
      ...(includeDiff
        ? {}
        : {
            diff_omitted:
              "call again with include_diff: true to get the patches",
          }),
      review_comments: threads.slice(0, MAX_THREADS).map((thread) => ({
        id: thread.id,
        path: thread.root.path,
        line: thread.root.line,
        original_line: thread.root.original_line,
        side: thread.root.side,
        start_line: thread.root.start_line,
        original_start_line: thread.root.original_start_line,
        outdated: thread.resolution?.outdated ?? thread.root.line == null,
        resolved: !!thread.resolution?.resolved,
        url: thread.root.html_url,
        comments: thread.comments.map((c) => ({
          author: c.user?.login ?? null,
          body: cap(c.body, MAX_COMMENT_CHARS),
          created_at: c.created_at,
        })),
      })),
      comments: comments.slice(-MAX_COMMENTS).map((c) => ({
        author: c.user?.login ?? null,
        body: cap(c.body, MAX_COMMENT_CHARS),
        created_at: c.created_at,
      })),
    },
    success: true,
  };
}

// ── Scriptures ─────────────────────────────── ────────────────────────────────

async function commentPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  if (!body) return { result: { error: "body is required." }, success: false };
  const target = await ctx.repo();
  if (!target) return noRepo();

  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(
    0,
    MAX_BODY_LENGTH,
  );
  const comment = await forgeFor(target.provider).createPullRequestComment({
    token: target.token,
    repoFullName: target.repoFullName,
    number,
    body: signed,
  });
  return { result: { id: comment.id, url: comment.html_url }, success: true };
}

async function commentPullRequestLine(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  const path = str(args.path);
  const line = int(args.line);
  const side = args.side === "LEFT" ? "LEFT" : "RIGHT";
  if (!body) return { result: { error: "body is required." }, success: false };
  if (!path) return { result: { error: "path is required." }, success: false };
  if (line == null || line < 1) {
    return {
      result: { error: "line must be a positive integer." },
      success: false,
    };
  }

  // The ceiling BEFORE any call for forging: exceeded, there is nothing to try.
  if (AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used <= 0) {
    return {
      result: {
        error:
          `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this run allows, ` +
          `across every pull request. Say the rest in a pull request comment (comment_pull_request), most serious first.`,
      },
      success: false,
    };
  }

  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  // Same anchor validation as the replay session: one commentable line
  // is a line of the DIFF, and a refusal makes the RANGES which are.
  const { files } = await forge.listPullRequestFiles(call);
  const anchor = resolvePrCommentAnchor(files, { path, line, side });
  if (!anchor.ok) return { result: { error: anchor.error }, success: false };

  const reserved = ctx.reserveInline ? await ctx.reserveInline() : null;
  if (ctx.reserveInline && reserved === null) {
    return {
      result: {
        error: `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this run allows, across every pull request. Say the rest in a pull request comment (comment_pull_request), most serious first.`,
      },
      success: false,
    };
  }
  if (reserved !== null) ctx.inline.used = reserved;

  const outcome = await forgeCall(async () => {
    const comment = await forge.createPullRequestReviewComment({
      ...call,
      body: body.slice(0, MAX_BODY_LENGTH),
      path: anchor.path,
      line,
      side,
    });
    if (reserved === null) ctx.inline.used++;
    return {
      result: {
        id: comment.id,
        path: anchor.path,
        line,
        side,
        url: comment.html_url,
        remaining: AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used,
      },
      success: true,
    };
  }, "The head may have moved since you read the diff — put the point in a pull request comment.");
  if (!outcome.success && reserved !== null && ctx.releaseInline) {
    ctx.inline.used = (await ctx.releaseInline()) ?? ctx.inline.used;
  }
  return outcome;
}

async function replyPullRequestThread(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const body = str(args.body);
  const commentId = int(args.comment_id);
  if (!body) return { result: { error: "body is required." }, success: false };
  if (commentId == null || commentId <= 0) {
    return {
      result: {
        error:
          "comment_id must be the numeric id of a REVIEW comment of that pull request — read_pull_request lists one per thread.",
      },
      success: false,
    };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();

  return await forgeCall(async () => {
    const reply = await forgeFor(
      target.provider,
    ).replyToPullRequestReviewComment({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      commentId,
      body: body.slice(0, MAX_BODY_LENGTH),
    });
    return { result: { id: reply.id, url: reply.html_url }, success: true };
  }, "Check that comment_id is a review comment (anchored to a line) of THIS pull request.");
}

const VERDICTS = ["approve", "request_changes", "comment"] as const;
type Verdict = (typeof VERDICTS)[number];

async function reviewPullRequest(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const verdict = str(args.verdict) as Verdict;
  const body = str(args.body);
  if (!VERDICTS.includes(verdict)) {
    return {
      result: { error: `verdict must be one of: ${VERDICTS.join(", ")}.` },
      success: false,
    };
  }
  if (!body) {
    return {
      result: {
        error:
          "body is required: a verdict without its reasons is not a review.",
      },
      success: false,
    };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();

  return await forgeCall(async () => {
    const submission = await forgeFor(target.provider).submitReview({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      verdict,
      locale: ctx.locale,
      body: signReviewBody(body, ctx.model, ctx.locale).slice(
        0,
        MAX_BODY_LENGTH,
      ),
    });
    return {
      result: {
        verdict,
        published: submission.published,
        // The NORMAL case of a PR opened by Numo: the forge refuses the self-review
        // and the verdict goes into commentary. Say it, otherwise the model pays off
        // “approved” on a PR that no one approved.
        ...(submission.published === "comment"
          ? {
              note:
                "The forge refused the formal verdict (a pull request cannot be reviewed by the account that opened it), " +
                "so it was posted as a comment carrying the verdict. Nothing was approved on the forge — say so.",
            }
          : {}),
      },
      success: true,
    };
  }, "Check the pull request is open and that the repository allows reviews from this app.");
}

const STATES = ["merged", "closed", "open", "ready_for_review"] as const;
type TargetState = (typeof STATES)[number];

async function setPullRequestState(
  ctx: ProjectPrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const number = prNumber(args);
  if (typeof number !== "number") return { result: number, success: false };
  const state = str(args.state) as TargetState;
  if (!STATES.includes(state)) {
    return {
      result: { error: `state must be one of: ${STATES.join(", ")}.` },
      success: false,
    };
  }
  const target = await ctx.repo();
  if (!target) return noRepo();
  const forge = forgeFor(target.provider);
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  if (state === "merged") {
    const method = str(args.merge_method) as MergeMethod;
    if (method && !forge.mergeMethods.includes(method)) {
      return {
        result: {
          error: `merge_method '${method}' is not offered by ${forge.provider}. Available: ${forge.mergeMethods.join(", ")}.`,
        },
        success: false,
      };
    }
    return await forgeCall(async () => {
      await forge.mergePullRequest({ ...call, ...(method ? { method } : {}) });
      return {
        result: { number, state: "merged", method: method || null },
        success: true,
      };
    }, "A merge is refused when the branch is protected, the checks are red, the approvals are missing or the branch conflicts — read_pull_request shows mergeable_state.");
  }

  if (state === "closed") {
    return await forgeCall(async () => {
      await forge.closePullRequest(call);
      return { result: { number, state: "closed" }, success: true };
    }, "");
  }

  if (state === "open") {
    return await forgeCall(async () => {
      const pr = await forge.reopenPullRequest(call);
      return {
        result: { number, state: pr.merged ? "merged" : pr.state },
        success: true,
      };
    }, "A merged pull request cannot be reopened.");
  }

  // `ready_for_review`: GitHub only addresses the mutation by the node id
  // GraphQL, that only the GET of ONE pull request is used (see `forge.ts`).
  return await forgeCall(async () => {
    const pr = await forge.getPullRequest(call);
    if (!pr.draft) {
      return {
        result: {
          number,
          state: "open",
          note: "This pull request was not a draft — nothing to do.",
        },
        success: true,
      };
    }
    await forge.markReadyForReview({
      ...call,
      ...(pr.nodeId ? { nodeId: pr.nodeId } : {}),
    });
    return { result: { number, state: "open" }, success: true };
  }, "");
}

// ── Plomberie ───────────────────────────────────────────────────────────────

function noRepo(): ToolOutcome {
  return {
    result: {
      error:
        "This project has no linked repository, so it has no pull requests. Say so instead of retrying.",
    },
    success: false,
  };
}

/**
 * A FORGE refusal rendered as a tool error, never as an exception:
 * the model can correct a 422 if it reads what the forge said, it can only
 * undergo a falling ride. `hint` says what to do with it.
 */
async function forgeCall(
  fn: () => Promise<ToolOutcome>,
  hint: string,
): Promise<ToolOutcome> {
  try {
    return await fn();
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error: `The forge refused this (${err.status}): ${err.message}.${hint ? ` ${hint}` : ""}`,
        },
        success: false,
      };
    }
    throw err;
  }
}

/** Runs a tool from this family. The caller has already routed on the names. */
export async function executeProjectPrTool(
  ctx: ProjectPrToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "list_pull_requests":
        return await listPullRequests(ctx, args);
      case "read_pull_request":
        return await readPullRequest(ctx, args);
      case "comment_pull_request":
        return await commentPullRequest(ctx, args);
      case "comment_pull_request_line":
        return await commentPullRequestLine(ctx, args);
      case "reply_pull_request_thread":
        return await replyPullRequestThread(ctx, args);
      case "review_pull_request":
        return await reviewPullRequest(ctx, args);
      case "set_pull_request_state":
        return await setPullRequestState(ctx, args);
      default:
        return {
          result: { error: `Unknown pull request tool: ${name}` },
          success: false,
        };
    }
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error: `The forge refused this (${err.status}): ${err.message}`,
        },
        success: false,
      };
    }
    return {
      result: { error: err instanceof Error ? err.message : String(err) },
      success: false,
    };
  }
}
