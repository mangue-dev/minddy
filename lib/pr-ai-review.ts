import type {
  PullRequestComment,
  PullRequestReviewComment,
} from "@/lib/agent-api";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import {
  PR_BODY_COMMENT_ID,
  type ReviewCommentReaction,
} from "@/lib/pr-review-reactions";
import {
  AI_REVIEW_PROVIDERS,
  aiReviewProviderForLogin,
} from "./pr-ai-review/providers";
import type { AiReviewProvider, AiReviewState } from "./pr-ai-review/types";

export interface AiReviewStatus {
  provider: AiReviewProvider;
  state: AiReviewState;
  startedAt: string | null;
  updatedAt: string;
  durationMs: number | null;
  url: string | null;
}

interface Signal {
  state: AiReviewState;
  at: string;
  url: string | null;
  requestAt?: string;
  findingCommentIds?: number[];
}

/** Equal timestamps settle conservatively: findings outrank a clean result. */
const SIGNAL_RANK: Record<AiReviewState, number> = {
  requested: 0,
  running: 1,
  completed: 2,
  clean: 3,
  skipped: 4,
  failed: 5,
  findings: 6,
};

/** One latest lifecycle per provider; counts alone never establish a verdict. */
export function buildAiReviewStatuses(input: {
  forge: string;
  comments: PullRequestComment[];
  timeline: PrTimelineEvent[];
  reviewComments: PullRequestReviewComment[];
  reviewThreads: ReviewThreadState[];
  reactions: ReviewCommentReaction[];
  prUrl: string | null;
}): AiReviewStatus[] {
  // GitLab bot usernames are installation-specific and need their own identity contract.
  if (input.forge !== "github") return [];
  const byProvider = new Map<AiReviewProvider, Signal[]>();
  const resolvedByComment = new Map(
    input.reviewThreads.map((thread) => [
      thread.rootCommentId,
      thread.resolved,
    ]),
  );
  const findingComments = input.reviewComments.filter((comment) => {
    const provider = aiReviewProviderForLogin(comment.user?.login);
    return (
      provider &&
      !comment.in_reply_to_id &&
      provider.parseMessage({ body: comment.body, kind: "inline" }) ===
        "findings"
    );
  });
  const add = (
    provider: AiReviewProvider,
    state: AiReviewState | null,
    at: string | null | undefined,
    url: string | null,
    requestAt?: string,
    findingCommentIds?: number[],
  ) => {
    if (!state || !at || !Number.isFinite(Date.parse(at))) return;
    const signals = byProvider.get(provider) ?? [];
    signals.push({ state, at, url, requestAt, findingCommentIds });
    byProvider.set(provider, signals);
  };
  const requests = new Map<number, AiReviewProvider[]>();
  for (const comment of input.comments) {
    const author = aiReviewProviderForLogin(comment.user?.login);
    if (author) {
      const activity = author.parseActivity?.(comment.body);
      if (activity)
        add(
          author,
          activity.state,
          activity.at ?? comment.updated_at ?? comment.created_at,
          comment.html_url,
        );
      add(
        author,
        author.parseMessage({ body: comment.body, kind: "comment" }),
        comment.updated_at ?? comment.created_at,
        comment.html_url,
      );
    } else if (comment.user && !comment.user.login.endsWith("[bot]")) {
      const providers = AI_REVIEW_PROVIDERS.filter((provider) =>
        provider.isRequest(comment.body),
      );
      requests.set(comment.id, providers);
      for (const provider of providers)
        add(
          provider,
          "requested",
          comment.created_at,
          comment.html_url,
          comment.created_at,
        );
    }
  }
  for (const reaction of input.reactions) {
    for (const actor of reaction.reviewerActors ?? []) {
      const provider = aiReviewProviderForLogin(actor.login);
      if (
        !provider ||
        (reaction.commentId !== PR_BODY_COMMENT_ID &&
          !requests.get(reaction.commentId)?.includes(provider))
      )
        continue;
      const url =
        input.comments.find((comment) => comment.id === reaction.commentId)
          ?.html_url ?? input.prUrl;
      const target = input.comments.find(
        (comment) => comment.id === reaction.commentId,
      );
      add(
        provider,
        provider.reactionStates[reaction.content] ?? null,
        actor.createdAt,
        url,
        target?.created_at,
      );
    }
  }
  for (const event of input.timeline) {
    const provider = aiReviewProviderForLogin(event.actor?.login);
    if (
      provider &&
      event.kind === "reviewed" &&
      event.reviewState !== "dismissed"
    ) {
      add(
        provider,
        provider.parseMessage({
          body: event.body ?? "",
          kind: "review",
          verdict: event.reviewState,
        }),
        event.createdAt,
        event.url ?? input.prUrl,
        undefined,
        findingComments
          .filter(
            (comment) =>
              aiReviewProviderForLogin(comment.user?.login) === provider &&
              comment.review_id != null &&
              (event.reviewIds ?? [event.reviewId]).includes(comment.review_id),
          )
          .map((comment) => comment.id),
      );
    }
  }
  for (const comment of input.reviewComments) {
    const provider = aiReviewProviderForLogin(comment.user?.login);
    // Follow-up replies are conversations, not new review findings.
    if (provider && !comment.in_reply_to_id)
      add(
        provider,
        provider.parseMessage({ body: comment.body, kind: "inline" }),
        comment.created_at,
        comment.html_url,
        undefined,
        [comment.id],
      );
  }
  const result: AiReviewStatus[] = [];
  for (const provider of AI_REVIEW_PROVIDERS) {
    const signals = byProvider.get(provider);
    if (!signals?.length) continue;
    signals.sort(
      (a, b) =>
        Date.parse(a.at) - Date.parse(b.at) ||
        SIGNAL_RANK[a.state] - SIGNAL_RANK[b.state],
    );
    let latestRequestAt: string | null = null;
    let activeFindings: Signal[] = [];
    const status = signals.reduce<AiReviewStatus | null>((status, signal) => {
      if (
        signal.requestAt &&
        latestRequestAt &&
        Date.parse(signal.requestAt) < Date.parse(latestRequestAt)
      )
        return status;
      if (signal.state === "requested" && signal.requestAt)
        latestRequestAt = signal.at;
      const newCycle =
        signal.state === "requested" ||
        (signal.state === "running" &&
          status?.state !== "requested" &&
          status?.state !== "running");
      if (newCycle) activeFindings = [];
      if (signal.state === "findings") activeFindings.push(signal);
      const startedAt =
        signal.state === "requested"
          ? null
          : signal.state === "running"
            ? newCycle
              ? signal.at
              : (status?.startedAt ?? signal.at)
            : (status?.startedAt ?? null);
      const state =
        signal.state === "completed" &&
        (status?.state === "findings" || status?.state === "clean")
          ? status.state
          : signal.state;
      return {
        provider,
        state,
        startedAt,
        updatedAt: signal.at,
        durationMs:
          startedAt && state !== "running" && state !== "requested"
            ? Math.max(0, Date.parse(signal.at) - Date.parse(startedAt))
            : null,
        url:
          (state === "findings" || state === "clean") &&
          signal.state === "completed"
            ? (status?.url ?? signal.url)
            : signal.url,
      };
    }, null);
    if (status) {
      // Resolution settles existing findings without inventing a new provider verdict or timestamp.
      const allFindingsResolved =
        status.state === "findings" &&
        activeFindings.length > 0 &&
        activeFindings.every(
          (signal) =>
            signal.findingCommentIds?.length &&
            signal.findingCommentIds.every(
              (id) => resolvedByComment.get(id) === true,
            ),
        );
      result.push(
        allFindingsResolved ? { ...status, state: "completed" } : status,
      );
    }
  }
  return result;
}
