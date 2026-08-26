import "server-only";

import { resolveDiffPosition } from "./mr-position";
import { isForgeApiError, type Forge } from "./forge";
import { AI_REVIEW_MAX_INLINE_COMMENTS } from "./tools";

export { AI_REVIEW_MAX_INLINE_COMMENTS };

/**
 * The three writes of a REREADING session (MIN-168): comment on a line,
 * comment on the thread, reply to a thread. That's all a run anchored to a pull
 * request can get out of the sandbox — it has no editing tools, no
 * `create_pr`, and the harness neither commits nor pushes anything for it
 * (`writesToRepo` in `execute.ts`). Read-only is a property of the GAME DE
 * TOOLS, not a prompt sentence: same doctrine as the subagent `explore`.
 *
 * Two rules from MIN-141 survive as is, and they live here:
 *
 * **The ceiling of five line comments.** Fifteen comments anchored on a
 * PR, this is no longer a review, it's noise. The SOURCE OF TRUTH of the counter
 * is the CHECKPOINT of the run (`AgentCheckpoint.prInlineComments`), not a variable
 * of round: a run lives several chunks and several rounds of conversation, and a counter which would start from zero each time it wakes up would make the ceiling a
 * courtesy. The counter is therefore carried by an object that `execute.ts` sows from
 * the checkpoint and rereads to persist it — which makes the ceiling “5 per RUN”
 * in the strict sense, restart and new turn included.
 *
 * **The verdict is written in the BODY.** No method here submits
 * a review event to the forge: a `APPROVE` posted by the app would satisfy a
 * branch protection that requires approval, a `REQUEST_CHANGES` would block
 * the PR until a human raises it. Numo gives notice, it does not hold the
 * door.
 *
 * ANCHORING is the rest of the work. A commentable line is a line from the DIFF,
 * not a line from the file: the two forges refuse in 422 an anchor outside of diff.
 * We therefore validate before calling (`resolveDiffPosition`, the same code which is used to
 * post on the GitLab side), and a refusal returns the RANGES to the agent actually
 * commentables of the file — an error it can correct, instead of a 422 that it
 * can only suffer.
 */

/** Names of PR tools (routed to this module by execute.ts). */
/** Names of the tools in this module. They live in `platform-tool-names.ts` since
 * MIN-224 — ROUTING goes down to the microVM, EXECUTION stays here — and are
 * re-exported so nothing has to change import. */
export { PR_TOOL_NAMES } from "./platform-tool-names";

/** A file from the diff, reduced to what the anchor reads (`PullRequestFile` satisfies it). */
export interface ReviewableFile {
  filename: string;
  status: string;
  additions?: number;
  deletions?: number;
  patch?: string;
  /** Path BEFORE the PR if the file has been renamed — it addresses the base version. */
  previous_filename?: string;
}

type ToolOutcome = { result: unknown; success: boolean };

export interface PrToolContext {
  forge: Forge;
  call: { token: string; repoFullName: string; number: number };
  /** Diff files, lazily loaded and stored for the chunk. */
  files: () => Promise<ReviewableFile[]>;
  /** Model of the run — it signs the synthesis. */
  model: string;
  /** Signature language: that of the launcher. */
  locale: string;
  /**
   * Counter of anchors placed by THIS RUN. MUTATED object here and persisted by
   * `execute.ts` in the checkpoint: this is what makes the cap insensitive to
   * the restart and the next turn.
   */
  inline: { used: number };
  reserveInline?: () => Promise<number | null>;
  releaseInline?: () => Promise<number | null>;
}

// ── Anchoring ────────────────────────────────────────────────────────────────

/**
 * The path as the model wrote it, reduced to a file path.
 *
 * A model happily copies the entire header of a diff file
 * (`lib/demo.ts (renamed from lib/vieux.ts) — modified · +2 −1`). The following
 * ` — ` or ` (` has never been part of a path: without this cleanup, the anchor
 * would be lost for a purely typographical reason.
 *
 * Is only tried SECOND, after strict equality: a true file whose
 * name contains a parenthesis (`app/(marketing)/page.tsx` — they are legion in
 * this repository) is found by the first pass and never sees this cleanup.
 */
export function normalizeFindingPath(raw: string): string {
  const unquoted = raw
    .trim()
    .replace(/^[`"']+/, "")
    .replace(/[`"']+$/, "")
    .trim();
  const cut = [" — ", " ("].reduce((min, marker) => {
    const at = unquoted.indexOf(marker);
    return at === -1 ? min : Math.min(min, at);
  }, unquoted.length);
  return unquoted.slice(0, cut).trim().replace(/^\.\//, "");
}

/**
 * Finds the diff file designated by `path`, regardless of which side was named.
 *
 * A rename makes the two paths diverge, and the agent may name either one — it
 * reads both from the diff. Look up both the CURRENT path and
 * `previous_filename`, in both directions.
 */
export function findReviewableFile(
  files: ReviewableFile[],
  path: string,
  side: "LEFT" | "RIGHT",
): ReviewableFile | null {
  const byNewPath = new Map<string, ReviewableFile>();
  const byOldPath = new Map<string, ReviewableFile>();
  for (const file of files) {
    byNewPath.set(file.filename, file);
    byOldPath.set(file.previous_filename ?? file.filename, file);
  }
  const lookup = (p: string) =>
    (side === "LEFT" ? byOldPath.get(p) : byNewPath.get(p)) ??
    byNewPath.get(p) ??
    byOldPath.get(p) ??
    null;
  // Try it as-is first, then cleaned up (see `normalizeFindingPath`).
  return lookup(path) ?? lookup(normalizeFindingPath(path));
}

/**
 * The genuinely commentable line ranges of a patch on the requested side —
 * what we return to the agent when its anchor lands beside the diff.
 *
 * RIGHT: added and context lines, numbered in the NEW file. LEFT: deleted and
 * context lines, numbered in the OLD file. Adjacent ranges are merged: a diff
 * with ten hunks should return ten readable intervals, not three hundred numbers.
 */
export function commentableRanges(
  patch: string,
  side: "LEFT" | "RIGHT",
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const push = (n: number) => {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else if (!last || n > last[1]) ranges.push([n, n]);
  };

  let oldN = 0;
  let newN = 0;
  let inHunk = false;
  const lines = patch.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  for (const l of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      oldN = Number(m[1]);
      newN = Number(m[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk || l.startsWith("\\")) continue;
    if (l.startsWith("+")) {
      if (side === "RIGHT") push(newN);
      newN++;
    } else if (l.startsWith("-")) {
      if (side === "LEFT") push(oldN);
      oldN++;
    } else {
      push(side === "RIGHT" ? newN : oldN);
      oldN++;
      newN++;
    }
  }
  return ranges;
}

/** Ranges shown to the agent: `12–48, 91` — readable and ready to copy as-is. */
export function formatRanges(ranges: Array<[number, number]>): string {
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

export type PrAnchorResult =
  { ok: true; path: string } | { ok: false; error: string };

/**
 * Validates a line-comment anchor BEFORE calling the forge.
 *
 * The SELECTED path is the file path as it EXISTS IN the PR, on either side of
 * the diff: a review comment addresses the current file, never its former name.
 * A LEFT anchor using the old name would be rejected by the forge — and, if it
 * got through, would land in orphaned threads in the diff view, which indexes by
 * the current name.
 */
export function resolvePrCommentAnchor(
  files: ReviewableFile[],
  input: { path: string; line: number; side: "LEFT" | "RIGHT" },
): PrAnchorResult {
  const file = findReviewableFile(files, input.path, input.side);
  if (!file) {
    const names = files.slice(0, 40).map((f) => f.filename);
    return {
      ok: false,
      error:
        `'${input.path}' is not part of this pull request's diff, so nothing can be anchored to it. ` +
        `Comment on a file the pull request actually changes` +
        (names.length > 0 ? `: ${names.join(", ")}` : "") +
        `${files.length > names.length ? `, … (${files.length} files total)` : ""}. ` +
        `Everything else goes in your summary comment.`,
    };
  }

  const patch = file.patch?.trim();
  if (!patch) {
    return {
      ok: false,
      error:
        `'${file.filename}' has no readable diff (binary, too large for the forge, or a pure rename), ` +
        `so no line of it can be commented. Put what you have to say about it in your summary comment.`,
    };
  }

  if (!resolveDiffPosition(patch, input.line, input.side)) {
    const ranges = commentableRanges(patch, input.side);
    return {
      ok: false,
      error:
        `Line ${input.line} (${input.side}) is not in the diff of '${file.filename}': a comment anchors to a line ` +
        `the pull request shows, not to any line of the file. ` +
        (ranges.length > 0
          ? `Commentable ${input.side} lines here: ${formatRanges(ranges)}.`
          : `No ${input.side} line of this file is commentable.`) +
        ` Pick one of them, or put the point in your summary comment.`,
    };
  }

  return { ok: true, path: file.filename };
}

// ── Review-summary signature ────────────────────────────────────────────────

const SIGNATURE: Record<string, (model: string) => string> = {
  fr: (model) => `🤖 Relu par Numo (minddy) · ${model}`,
  en: (model) => `🤖 Reviewed by Numo (minddy) · ${model}`,
};

/**
 * Signs a summary — exactly ONCE.
 *
 * The HARNESS adds the signature rather than asking the model for it: it is a
 * fact (which model reread the summary), not an opinion, and a model asked to
 * sign may forget, invent another model name, or sign twice. The guard remains
 * useful if it writes one anyway: a body that already bears the `🤖` signature
 * marker is returned unchanged.
 */
export function signReviewBody(
  body: string,
  model: string,
  locale: string,
): string {
  const trimmed = body.trim();
  const sign = SIGNATURE[locale] ?? SIGNATURE.en;
  const line = sign(model);
  if (trimmed.includes(line)) return trimmed;
  // A signature in ANOTHER language or from another model counts too: we avoid a
  // duplicate footer, not one particular string.
  if (/🤖\s*(Relu par|Reviewed by) Numo \(minddy\)/.test(trimmed))
    return trimmed;
  return `${trimmed}\n\n---\n${line}`;
}

// ── Handlers ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Accepted comment body — GitHub rejects anything over 65,536 characters. */
const MAX_BODY_LENGTH = 65_536;

async function commentPrLine(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  const path = str(args.path);
  const rawLine = typeof args.line === "number" ? args.line : Number(args.line);
  const side = args.side === "LEFT" ? "LEFT" : "RIGHT";

  if (!body) return { result: { error: "body is required." }, success: false };
  if (!path) return { result: { error: "path is required." }, success: false };
  if (!Number.isInteger(rawLine) || rawLine < 1) {
    return {
      result: { error: "line must be a positive integer." },
      success: false,
    };
  }

  // Enforce the ceiling BEFORE any forge call: once exceeded, there is nothing to try.
  const left = AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used;
  if (left <= 0) {
    return {
      result: {
        error:
          `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this review allows. ` +
          `Everything else goes in your summary comment (comment_pr), most serious first.`,
      },
      success: false,
    };
  }

  const anchor = resolvePrCommentAnchor(await ctx.files(), {
    path,
    line: rawLine,
    side,
  });
  if (!anchor.ok) return { result: { error: anchor.error }, success: false };

  const reserved = ctx.reserveInline ? await ctx.reserveInline() : null;
  if (ctx.reserveInline && reserved === null) {
    return {
      result: {
        error: `You have already posted the ${AI_REVIEW_MAX_INLINE_COMMENTS} line comments this review allows. Everything else goes in your summary comment (comment_pr), most serious first.`,
      },
      success: false,
    };
  }
  if (reserved !== null) ctx.inline.used = reserved;

  try {
    const comment = await ctx.forge.createPullRequestReviewComment({
      ...ctx.call,
      body: body.slice(0, MAX_BODY_LENGTH),
      path: anchor.path,
      line: rawLine,
      side,
    });
    if (reserved === null) ctx.inline.used++;
    return {
      result: {
        id: comment.id,
        path: anchor.path,
        line: rawLine,
        side,
        url: comment.html_url,
        remaining: AI_REVIEW_MAX_INLINE_COMMENTS - ctx.inline.used,
      },
      success: true,
    };
  } catch (err) {
    // A forge rejection does NOT consume the ceiling: nothing was posted. The
    // expected case is 422 (the head moved between reading the diff and sending).
    if (isForgeApiError(err)) {
      if (reserved !== null && ctx.releaseInline) {
        ctx.inline.used = (await ctx.releaseInline()) ?? ctx.inline.used;
      }
      return {
        result: {
          error:
            `The forge refused this anchor (${err.status}): ${err.message}. ` +
            `The head may have moved since you read the diff — put the point in your summary comment.`,
        },
        success: false,
      };
    }
    throw err;
  }
}

async function commentPr(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  if (!body) return { result: { error: "body is required." }, success: false };
  const signed = signReviewBody(body, ctx.model, ctx.locale).slice(
    0,
    MAX_BODY_LENGTH,
  );
  const comment = await ctx.forge.createPullRequestComment({
    ...ctx.call,
    body: signed,
  });
  return { result: { id: comment.id, url: comment.html_url }, success: true };
}

async function replyPrThread(
  ctx: PrToolContext,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const body = str(args.body);
  const commentId =
    typeof args.comment_id === "number"
      ? args.comment_id
      : Number(args.comment_id);
  if (!body) return { result: { error: "body is required." }, success: false };
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return {
      result: {
        error:
          "comment_id must be the numeric id of a review comment of this pull request — the one your context lists for that thread.",
      },
      success: false,
    };
  }
  try {
    const reply = await ctx.forge.replyToPullRequestReviewComment({
      ...ctx.call,
      commentId,
      body: body.slice(0, MAX_BODY_LENGTH),
    });
    return { result: { id: reply.id, url: reply.html_url }, success: true };
  } catch (err) {
    if (isForgeApiError(err)) {
      return {
        result: {
          error:
            `The forge refused this reply (${err.status}): ${err.message}. ` +
            `Check that comment_id is a REVIEW comment (anchored to a line) of this pull request.`,
        },
        success: false,
      };
    }
    throw err;
  }
}

/**
 * Executes a PR tool. A REPEATED SUMMARY is allowed and is not an accident: a
 * review session is conversational, and replying a second time in the thread is
 * exactly what a human reviewer does. Each message is signed once; the CEILING
 * is what limits what counts — the anchors.
 */
export async function executePrTool(
  ctx: PrToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "comment_pr_line":
        return await commentPrLine(ctx, args);
      case "comment_pr":
        return await commentPr(ctx, args);
      case "reply_pr_thread":
        return await replyPrThread(ctx, args);
      default:
        return {
          result: { error: `Unknown pull request tool: ${name}` },
          success: false,
        };
    }
  } catch (err) {
    return {
      result: { error: err instanceof Error ? err.message : String(err) },
      success: false,
    };
  }
}
