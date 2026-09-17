import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepoProviderId } from "@/lib/repo-providers";
import { assertIssueInProject } from "@/lib/server/issue-reads";
import {
  forgeFor,
  isForgeApiError,
  type Forge,
  type MergeMethod,
} from "@/lib/server/agent/forge";
import { signReviewBody } from "@/lib/server/agent/pr-tools";
import { getGithubAppSlug } from "@/lib/server/git/github-app";
import { broadcastPrChanged } from "@/lib/server/agent/pr-live";
import {
  findPullRequest,
  findPullRequestForIssue,
  rowProvider,
  upsertPullRequest,
  type PullRequestRow,
} from "@/lib/server/agent/pull-requests";
import { syncPrState } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";

/**
 * Direct PR-management gestures for Numo (MIN-550): merge, rename /
 * re-describe, post a conversation comment, edit a comment Numo posted
 * itself, resolve (or reopen) review conversations. Everything CODE remains
 * delegated to the code agent (`launch_code_agent`) — these tools only touch
 * PR metadata and thread.
 *
 * They reuse the provider-agnostic `Forge` surface and the `pull_requests`
 * table, exactly like the code agent's own PR family
 * (`lib/server/agent/project-pr-tools.ts`), under the SAME identity: the
 * installation token, i.e. the minddy account (see the identity table in
 * `forge.ts`). A PR merged through the conversation therefore does not
 * borrow the hand of the member who asked.
 *
 * The merge carries the guardrails the product asks for: the tool re-checks
 * the draft state, the merge conflicts and the CI checks BEFORE calling the
 * forge, and refuses with a readable error; the tool DESCRIPTION is what
 * tells the model to confirm with the user first (the same prompt-driven
 * garde-fou as every other destructive Numo tool). The linked issue's status
 * then follows the PR through the shared sync core — merged → done.
 */

/** Comment body accepted — GitHub refuses beyond 65,536 characters. */
const MAX_BODY_LENGTH = 65_536;

/** Failing checks named before refusing a merge — beyond that, the model has the idea. */
const MAX_FAILING_CHECKS_NAMED = 5;

export interface PullRequestWriteContext {
  projectId: string;
  /** The asking user — attribution of the issue-status write. */
  userId: string;
  /** Model name, carried by Numo's signature on comments. */
  model: string;
  /** Signature language. */
  locale: string;
  /** The user's RLS client, for the issue scope checks. */
  supabase: SupabaseClient;
}

export type PullRequestWriteOutcome = { result: unknown; success: boolean };

export type PullRequestWriteToolName =
  | "merge_pull_request"
  | "update_pull_request"
  | "post_pull_request_comment"
  | "edit_own_pull_request_comment"
  | "resolve_pull_request_threads";

export const PULL_REQUEST_WRITE_TOOL_NAMES: PullRequestWriteToolName[] = [
  "merge_pull_request",
  "update_pull_request",
  "post_pull_request_comment",
  "edit_own_pull_request_comment",
  "resolve_pull_request_threads",
];

// ── Resolution ──────────────────────────────────────────────────────────────

type Resolved = {
  forge: Forge;
  /** Fresh installation token + repository of the project's link. */
  target: { token: string; repoFullName: string; provider: RepoProviderId };
  number: number;
  /** Row in `pull_requests`, when the PR is known to the table. */
  row: PullRequestRow | null;
};

/**
 * Resolves the PR a gesture targets: exactly one of issue_id /
 * pull_request_id (same contract as `read_pull_request`), the row from
 * `pull_requests` — source of truth since MIN-143 — with the `agent_runs`
 * fallback for the rows older than the table, then the project's repo target,
 * refusing a PR that does not belong to it. `read_pull_request` reuses it so
 * the two surfaces never drift apart.
 */
export async function resolvePullRequest(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<Resolved | { error: string }> {
  const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
  const pullRequestId =
    typeof args.pull_request_id === "string" ? args.pull_request_id : "";
  if ((!issueId && !pullRequestId) || (issueId && pullRequestId)) {
    return { error: "Pass exactly one of issue_id or pull_request_id." };
  }
  if (issueId) {
    const scoped = await assertIssueInProject(
      ctx.supabase,
      issueId,
      ctx.projectId,
    );
    if (!scoped.ok) return { error: scoped.error };
  }

  const row = pullRequestId
    ? await findPullRequest(pullRequestId)
    : await findPullRequestForIssue(issueId);
  const target = await resolveRepoCloneTarget(ctx.projectId);
  if (!target) {
    return { error: "This project has no linked repository." };
  }
  if (
    row &&
    (target.provider !== rowProvider(row) ||
      target.repoFullName !== row.repo_full_name)
  ) {
    return { error: "The selected pull request is not available in this project." };
  }
  let number = row?.number ?? null;
  if (number == null && issueId) {
    // Same fallback as `read_pull_request`: LIVE PR first, otherwise the most
    // recent — an old issue can carry several runs with a PR.
    const { data: runs } = await ctx.supabase
      .from("agent_runs")
      .select("pr_number, pr_state")
      .eq("issue_id", issueId)
      .not("pr_number", "is", null)
      .order("created_at", { ascending: false });
    const rows = (runs ?? []) as { pr_number: number; pr_state: string | null }[];
    const live = rows.find((r) => r.pr_state === "draft" || r.pr_state === "open");
    number = (live ?? rows[0])?.pr_number ?? null;
  }
  if (number == null) {
    return {
      error: pullRequestId
        ? "The selected pull request is unavailable."
        : "This issue has no pull request attached yet.",
    };
  }
  return { forge: forgeFor(target.provider), target, number, row };
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * A FORGE refusal rendered as a tool error, never as an exception: the model
 * can correct a 422 when it reads what the forge said. `hint` says what to do
 * with it (same shape as the code agent family's helper).
 */
async function forgeCall(
  fn: () => Promise<PullRequestWriteOutcome>,
  hint: string,
): Promise<PullRequestWriteOutcome> {
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

// ── merge_pull_request ──────────────────────────────────────────────────────

async function mergePullRequest(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  const resolved = await resolvePullRequest(ctx, args);
  if ("error" in resolved) {
    return { result: { error: resolved.error }, success: false };
  }
  const { forge, target, number, row } = resolved;
  const method = str(args.merge_method) as MergeMethod;
  if (method && !forge.mergeMethods.includes(method)) {
    return {
      result: {
        error: `merge_method '${method}' is not offered by ${target.provider}. Available: ${forge.mergeMethods.join(", ")}.`,
      },
      success: false,
    };
  }
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  return await forgeCall(async () => {
    // Verify BEFORE acting (MIN-550): the forge only says "no" after the fact,
    // while these three checks are readable up front.
    const pr = await forge.getPullRequest(call);
    if (pr.merged) {
      return {
        result: {
          number,
          state: "merged",
          method: method || null,
          note: "This pull request is already merged — nothing to do.",
        },
        success: true,
      };
    }
    if (pr.state === "closed") {
      return {
        result: {
          error: "This pull request is closed. Reopen it before merging.",
        },
        success: false,
      };
    }
    if (pr.draft) {
      return {
        result: {
          error:
            "This pull request is still a draft — mark it ready for review before merging.",
        },
        success: false,
      };
    }
    if (pr.mergeable === false || pr.mergeableState === "dirty") {
      return {
        result: {
          error:
            "The head branch conflicts with the base branch — resolve the conflicts before merging. Delegate the fix to the code agent if needed.",
        },
        success: false,
      };
    }
    // Red or running CI: refusing is the whole point of the pre-check. An
    // unreadable checks summary (`null`, like a repo without CI or a missing
    // App permission) stays non-blocking — the forge has the final word.
    const checks = pr.headSha
      ? await forge
          .listChecks({ ...call, sha: pr.headSha })
          .catch(() => null)
      : null;
    if (checks?.state === "failure") {
      const failing = checks.checks
        .filter((c) => c.state === "failure")
        .slice(0, MAX_FAILING_CHECKS_NAMED)
        .map((c) => c.name);
      return {
        result: {
          error: `CI checks are failing (${failing.join(", ")}) — never merge a red pull request. Delegate the fix to the code agent instead.`,
        },
        success: false,
      };
    }
    if (checks?.state === "pending") {
      return {
        result: {
          error:
            "CI checks are still running — wait for them to finish before merging.",
        },
        success: false,
      };
    }

    await forge.mergePullRequest({ ...call, ...(method ? { method } : {}) });
    const issueStatus = await settleState(ctx, target, number, row, "merged");
    return {
      result: {
        number,
        state: "merged",
        method: method || null,
        ...(issueStatus ? { issue_status: issueStatus } : {}),
      },
      success: true,
    };
  }, "A merge is refused when the branch is protected, the checks are red, the approvals are missing or the branch conflicts.");
}

// ── update_pull_request ─────────────────────────────────────────────────────

async function updatePullRequest(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  const resolved = await resolvePullRequest(ctx, args);
  if ("error" in resolved) {
    return { result: { error: resolved.error }, success: false };
  }
  const { forge, target, number, row } = resolved;
  const title = str(args.title);
  const body = str(args.body);
  if (!title && !body) {
    return {
      result: { error: "Pass a title and/or a body to change." },
      success: false,
    };
  }
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  return await forgeCall(async () => {
    // GitHub serves the merged ref from either mutation, so read the state
    // from the FIRST return and reuse it for both gestures.
    const ref = title
      ? await forge.updatePullRequestTitle({ ...call, title })
      : await forge.getPullRequest(call);
    if (body) await forge.updatePullRequestBody({ ...call, body });

    // Keep the list page and the cards on the new title (the body is not
    // stored in `pull_requests`). The monotonic upsert keeps the rest.
    if (title && row) {
      broadcastPrChanged(row.id, ["pr", "conversation"]);
      await upsertPullRequest({
        provider: target.provider,
        repoFullName: target.repoFullName,
        number,
        state: row.state,
        title,
        issueId: row.issue_id ?? undefined,
      });
    }
    return {
      result: {
        number,
        ...(title ? { title: ref.title ?? title } : {}),
        ...(body ? { body_updated: true } : {}),
      },
      success: true,
    };
  }, "");
}

// ── post_pull_request_comment ────────────────────────────────────────────────────

async function commentPullRequest(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  const resolved = await resolvePullRequest(ctx, args);
  if ("error" in resolved) {
    return { result: { error: resolved.error }, success: false };
  }
  const { forge, target, number } = resolved;
  const body = str(args.body);
  if (!body) {
    return { result: { error: "body is required." }, success: false };
  }
  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(
    0,
    MAX_BODY_LENGTH,
  );

  return await forgeCall(async () => {
    const comment = await forge.createPullRequestComment({
      token: target.token,
      repoFullName: target.repoFullName,
      number,
      body: signed,
    });
    return {
      result: { id: comment.id, url: comment.html_url },
      success: true,
    };
  }, "Check the pull request is open.");
}

// ── edit_own_pull_request_comment ───────────────────────────────────────────

/** The footer `signReviewBody` appends to Numo's comments. */
const NUMO_SIGNATURE_RE = /🤖[^\n]*Numo \(minddy\)/;

/**
 * Login under which Numo writes at the forge — GitHub only
 * (`<slug>[bot]`). GitLab has no separate bot identity (MIN-146): Numo's
 * comments there are recognized by their signature.
 */
function numoLogin(provider: RepoProviderId): string | null {
  if (provider !== "github") return null;
  try {
    return `${getGithubAppSlug()}[bot]`;
  } catch {
    return null;
  }
}

function isNumoAuthored(
  comment: { user: { login: string } | null; body: string },
  provider: RepoProviderId,
): boolean {
  const login = comment.user?.login ?? null;
  if (login && numoLogin(provider) === login) return true;
  return NUMO_SIGNATURE_RE.test(comment.body);
}

async function editOwnPullRequestComment(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  const resolved = await resolvePullRequest(ctx, args);
  if ("error" in resolved) {
    return { result: { error: resolved.error }, success: false };
  }
  const { forge, target, number } = resolved;
  const commentId = int(args.comment_id);
  if (commentId == null) {
    return {
      result: { error: "comment_id must be the numeric id of your comment." },
      success: false,
    };
  }
  const body = str(args.body);
  if (!body) {
    return { result: { error: "body is required." }, success: false };
  }
  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(
    0,
    MAX_BODY_LENGTH,
  );
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  return await forgeCall(async () => {
    const comments = await forge.listPullRequestComments(call);
    const existing = comments.find((c) => c.id === commentId);
    if (!existing) {
      return {
        result: {
          error:
            "No conversation comment with that id on this pull request — read_pull_request lists them with their ids.",
        },
        success: false,
      };
    }
    if (!isNumoAuthored(existing, target.provider)) {
      return {
        result: {
          error:
            "That comment was not posted by you — you can only edit comments you signed yourself (Numo). Never edit a comment written by a human.",
        },
        success: false,
      };
    }
    const updated = await forge.updatePullRequestComment({
      ...call,
      commentId,
      body: signed,
    });
    return {
      result: { id: updated.id, url: updated.html_url },
      success: true,
    };
  }, "");
}

// ── resolve_pull_request_threads ────────────────────────────────────────────

/** Conversation roots moved per call — beyond that, the model is bulk-tidying. */
const MAX_THREAD_OPS = 50;

/**
 * Resolves or reopens review conversations, the gesture the MIN-139 UI gives
 * a human — Numo closes one itself once its request is addressed, no code
 * agent in the loop. A conversation is designated by the ROOT COMMENT id of
 * its thread, the same `id` `read_pull_request` lists; the executor matches
 * it against the forge's thread states to recover the opaque thread id the
 * forge actually resolves (GraphQL node id on GitHub, discussion id on
 * GitLab) — the model never handles that id. Threads already in the target
 * state are reported without a forge call, so replaying the gesture stays
 * silent. The write goes out under the installation token, like every
 * gesture of this family.
 */
async function resolvePullRequestThreads(
  ctx: PullRequestWriteContext,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  const resolved = await resolvePullRequest(ctx, args);
  if ("error" in resolved) {
    return { result: { error: resolved.error }, success: false };
  }
  const { forge, target, number, row } = resolved;
  const targetState = args.resolved !== false;
  const ids = (Array.isArray(args.comment_ids) ? args.comment_ids : [])
    .map((v) => int(v))
    .filter((v): v is number => v != null && v > 0);
  if (ids.length === 0) {
    return {
      result: {
        error:
          "comment_ids must be the root comment ids of the conversations, exactly as read_pull_request lists them.",
      },
      success: false,
    };
  }
  if (ids.length > MAX_THREAD_OPS) {
    return {
      result: {
        error: `At most ${MAX_THREAD_OPS} conversations per call — resolve the rest in another call.`,
      },
      success: false,
    };
  }
  const call = {
    token: target.token,
    repoFullName: target.repoFullName,
    number,
  };

  // The thread states pair every conversation with its forge id by root
  // comment. Without them there is nothing to resolve against — the states
  // are unreadable, or the conversations died at the forge — and that is a
  // readable refusal, not an exception.
  let states;
  try {
    states = await forge.listReviewThreads(call);
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error: `The review conversations could not be read (${err.status}): ${err.message}. Re-read the pull request first.`,
        },
        success: false,
      };
    }
    throw err;
  }
  const byRoot = new Map(states.map((s) => [s.rootCommentId, s]));

  const changed: number[] = [];
  const unchanged: number[] = [];
  const unknown: number[] = [];
  const failed: Array<{ id: number; error: string }> = [];
  for (const id of ids) {
    const state = byRoot.get(id);
    if (!state) {
      unknown.push(id);
      continue;
    }
    if (state.resolved === targetState) {
      unchanged.push(id);
      continue;
    }
    try {
      await forge.setReviewThreadResolved({
        ...call,
        threadId: state.threadId,
        resolved: targetState,
      });
      changed.push(id);
    } catch (err) {
      // One refused conversation must not sink the batch: the rest land, the
      // model reads what the forge said and can retry the refused one.
      if (isForgeApiError(err)) {
        failed.push({ id, error: `${err.status}: ${err.message}` });
      } else {
        throw err;
      }
    }
  }
  if (changed.length > 0 && row) {
    broadcastPrChanged(row.id, ["reviewComments"]);
  }
  return {
    result: {
      resolved: targetState,
      changed,
      unchanged,
      unknown,
      ...(failed.length > 0 ? { failed } : {}),
    },
    success: changed.length + unchanged.length > 0,
  };
}

// ── Post-write state sync ───────────────────────────────────────────────────

/**
 * The after-merge bookkeeping, mirroring the app's own merge path
 * (`propagatePrState`): the row, the runs, then the issue status through the
 * shared sync core. Best-effort — a missed row write must never fail the
 * gesture, the webhook or the next scan would catch the state up anyway.
 */
async function settleState(
  ctx: PullRequestWriteContext,
  target: { provider: RepoProviderId; repoFullName: string },
  number: number,
  row: PullRequestRow | null,
  state: "merged",
): Promise<string | null> {
  try {
    if (row) broadcastPrChanged(row.id, ["pr", "conversation"]);
    await upsertPullRequest({
      provider: target.provider,
      repoFullName: target.repoFullName,
      number,
      state,
      mergedAt: new Date().toISOString(),
      issueId: row?.issue_id ?? undefined,
    });
    await syncPrState({
      repoFullName: target.repoFullName,
      prNumber: number,
      prState: state,
      provider: target.provider,
    });
    const issueId = row?.issue_id;
    if (issueId) {
      await syncIssueStatusFromPr({
        issueId,
        actorId: ctx.userId,
        prState: state,
        forgeSync: target.provider,
      });
      return "done";
    }
    return null;
  } catch (err) {
    console.error("[assistant] PR state sync skipped:", (err as Error).message);
    return null;
  }
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

/** Runs one of this family's tools. The caller has already routed the name. */
export async function executePullRequestWriteTool(
  ctx: PullRequestWriteContext,
  name: PullRequestWriteToolName,
  args: Record<string, unknown>,
): Promise<PullRequestWriteOutcome> {
  switch (name) {
    case "merge_pull_request":
      return await mergePullRequest(ctx, args);
    case "update_pull_request":
      return await updatePullRequest(ctx, args);
    case "post_pull_request_comment":
      return await commentPullRequest(ctx, args);
    case "edit_own_pull_request_comment":
      return await editOwnPullRequestComment(ctx, args);
    case "resolve_pull_request_threads":
      return await resolvePullRequestThreads(ctx, args);
  }
}
