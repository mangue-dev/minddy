import { describe, expect, it } from "vitest";
import { buildAiReviewStatuses } from "./pr-ai-review";
import {
  AI_REVIEW_PROVIDERS,
  aiReviewProviderForLogin,
} from "./pr-ai-review/providers";
import type { ReviewCommentReaction } from "./pr-review-reactions";
import type { PullRequestComment, PullRequestReviewComment } from "./agent-api";
import type { PrTimelineEvent } from "./pr-timeline";

const bot = "chatgpt-codex-connector[bot]";
const date = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 2, 10, minutes)).toISOString();
const comment = (
  id: number,
  body: string,
  minutes = 0,
  login = "ada",
): PullRequestComment => ({
  id,
  body,
  created_at: date(minutes),
  html_url: `https://github.com/acme/app/pull/1#issuecomment-${id}`,
  user: { login, avatar_url: null },
});
const reaction = (
  content: ReviewCommentReaction["content"],
  minutes: number,
  commentId = 0,
  login = bot,
): ReviewCommentReaction => ({
  content,
  commentId,
  count: 1,
  mine: false,
  reviewerActors: [{ login, createdAt: date(minutes) }],
});
const review = (
  minutes: number,
  login = bot,
  body = "",
  state: PrTimelineEvent["reviewState"] = "commented",
): PrTimelineEvent => ({
  id: `review:${minutes}`,
  kind: "reviewed",
  actor: { login, avatar_url: null },
  createdAt: date(minutes),
  reviewState: state,
  body,
  url: "https://github.com/acme/app/pull/1#pullrequestreview-2",
});
const inline = (
  minutes: number,
  login = bot,
  reply = false,
): PullRequestReviewComment => ({
  id: minutes,
  body: "Fix the missing guard",
  path: "app.ts",
  line: 1,
  original_line: 1,
  side: "RIGHT",
  start_line: null,
  original_start_line: null,
  start_side: null,
  in_reply_to_id: reply ? 2 : null,
  review_id: 2,
  diff_hunk: "",
  user: { login, avatar_url: null },
  created_at: date(minutes),
  html_url: "https://github.com/acme/app/pull/1#discussion_r2",
});
const statuses = (
  input: Partial<Parameters<typeof buildAiReviewStatuses>[0]> = {},
) =>
  buildAiReviewStatuses({
    forge: "github",
    comments: [],
    timeline: [],
    reviewComments: [],
    reactions: [],
    prUrl: "https://github.com/acme/app/pull/1",
    ...input,
  });

describe("AI reviewer lifecycle", () => {
  it("keeps the real reaction start and freezes the completed duration", () => {
    const [status] = statuses({
      comments: [comment(1, "@codex review")],
      reactions: [reaction("+1", 4, 1), reaction("eyes", 1, 1)],
    });
    expect(status).toMatchObject({
      state: "clean",
      startedAt: date(1),
      durationMs: 180_000,
      updatedAt: date(4),
      url: comment(1, "").html_url,
    });
  });
  it("shows a request as waiting until the provider acknowledges it", () => {
    expect(
      statuses({ comments: [comment(1, "@codex review")] })[0],
    ).toMatchObject({ state: "requested", startedAt: null, durationMs: null });
  });
  it("does not infer clean results from counts or human reactions", () => {
    expect(
      statuses({
        reactions: [
          { content: "+1", count: 8, mine: true, commentId: 0 },
          reaction("eyes", 1, 0, "ada"),
        ],
      }),
    ).toEqual([]);
  });
  it("rejects lookalike bot accounts and ignores reactions on unrelated comments", () => {
    expect(aiReviewProviderForLogin("chatgpt-codex-connector")).toBeNull();
    expect(
      statuses({
        comments: [comment(1, "Thanks!")],
        reactions: [reaction("+1", 1, 1)],
      }),
    ).toEqual([]);
  });
  it("restarts the lifecycle for a new request and ignores late reactions on the old request", () => {
    const [status] = statuses({
      comments: [comment(1, "@codex review"), comment(2, "@codex review", 10)],
      reactions: [
        reaction("eyes", 1, 1),
        reaction("+1", 4, 1),
        reaction("+1", 12, 1),
        reaction("eyes", 11, 2),
      ],
    });
    expect(status).toMatchObject({
      state: "running",
      startedAt: date(11),
      durationMs: null,
    });
  });
  it("uses submitted review bodies and approvals, including automatic reviews", () => {
    expect(
      statuses({
        timeline: [
          review(2, bot, "## 💡 Codex Review\n\nHere are some suggestions."),
        ],
      })[0].state,
    ).toBe("findings");
    expect(
      statuses({ timeline: [review(2, bot, "", "approved")] })[0].state,
    ).toBe("clean");
  });
  it("does not turn inline follow-up replies into new findings", () => {
    expect(statuses({ reviewComments: [inline(3, bot, true)] })).toEqual([]);
    expect(statuses({ reviewComments: [inline(3)] })[0].state).toBe("findings");
  });
  it("settles equal timestamps conservatively regardless of input order", () => {
    expect(
      statuses({
        reactions: [reaction("+1", 3)],
        reviewComments: [inline(3)],
      })[0].state,
    ).toBe("findings");
  });
  it("keeps unknown submitted reviews neutral and undated signals invisible", () => {
    expect(statuses({ timeline: [review(2)] })[0]).toMatchObject({
      state: "completed",
      durationMs: null,
    });
    expect(
      statuses({ timeline: [{ ...review(2), createdAt: "bad-date" }] }),
    ).toEqual([]);
  });
  it("keeps separate providers independent and GitLab outside the GitHub identity contract", () => {
    expect(
      statuses({
        comments: [comment(1, "@codex review"), comment(2, "@greptileai")],
        reactions: [reaction("+1", 4, 2, "greptile-apps[bot]")],
      }).map((status) => [status.provider.id, status.state]),
    ).toEqual([
      ["codex", "requested"],
      ["greptile", "completed"],
    ]);
    expect(
      statuses({ forge: "gitlab", comments: [comment(1, "@codex review")] }),
    ).toEqual([]);
  });
});

describe("provider formats", () => {
  const [codex, coderabbit, greptile] = AI_REVIEW_PROVIDERS;
  it("parses the live Codex summary table and its provider timestamp without reading the help footer", () => {
    const body =
      '<!-- codex-pull-request-review-summary -->\n\n## Codex Review Summary\n\n| Review | Status | Commit | Review trigger |\n| --- | --- | --- | --- |\n| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-10-02T10:04:00.000Z">Oct 2</relative-time> | `1234567` | PR opened |\n\nCodex reacts with 👀 while any review is running and reacts with 👍 once all reviews finish with no findings.';
    const [status] = statuses({
      comments: [comment(3, body, 5, bot)],
      reactions: [reaction("eyes", 1), reaction("+1", 4)],
    });
    expect(status).toMatchObject({
      state: "clean",
      updatedAt: date(4),
      durationMs: 180_000,
    });
    expect(statuses({ comments: [comment(3, body, 5, bot)] })[0]).toMatchObject(
      { state: "completed", updatedAt: date(4) },
    );
  });
  it("keeps a security review active when code review has finished", () => {
    const body =
      "<!-- codex-pull-request-review-summary -->\n| 📝 **Code Review** | ✅ **Completed** | `123` | PR opened |\n| 🔒 **Security Review** | 👀 **In progress** | `123` | PR opened |";
    expect(codex.parseActivity?.(body)?.state).toBe("running");
  });
  it("only matches real request lines, excluding documentation and quoted examples", () => {
    for (const provider of AI_REVIEW_PROVIDERS) {
      expect(provider.isRequest(provider.requestCommand)).toBe(true);
      expect(provider.isRequest(`> ${provider.requestCommand}`)).toBe(false);
      expect(
        provider.isRequest(`\`\`\`text\n${provider.requestCommand}\n\`\`\``),
      ).toBe(false);
      expect(
        provider.isRequest(
          `Use \`${provider.requestCommand}\` to request a review.`,
        ),
      ).toBe(false);
    }
    expect(codex.isRequest("@codex fix the bug")).toBe(false);
    expect(coderabbit.isRequest("@coderabbitai summary")).toBe(false);
  });
  it("recognizes clean Codex output and review quota failures without classifying arbitrary replies", () => {
    expect(
      codex.parseMessage({
        body: "Codex Review: Didn't find any major issues",
        kind: "comment",
      }),
    ).toBe("clean");
    expect(
      codex.parseMessage({
        body: "You have reached your Codex usage limit for code reviews.",
        kind: "comment",
      }),
    ).toBe("failed");
    expect(
      codex.parseMessage({ body: "I've fixed the issue.", kind: "comment" }),
    ).toBeNull();
  });
  it("reads CodeRabbit markers and actionable counts instead of treating walkthroughs as clean", () => {
    expect(
      coderabbit.parseMessage({
        body: "<!-- This is an auto-generated comment: review in progress by coderabbit.ai -->",
        kind: "comment",
      }),
    ).toBe("running");
    expect(
      coderabbit.parseMessage({
        body: "<!-- This is an auto-generated comment: review skipped by coderabbit.ai -->",
        kind: "comment",
      }),
    ).toBe("skipped");
    expect(
      coderabbit.parseMessage({
        body: "**Actionable comments posted: 3**",
        kind: "review",
      }),
    ).toBe("findings");
    expect(
      coderabbit.parseMessage({
        body: "**Actionable comments posted: 0**",
        kind: "review",
      }),
    ).toBe("clean");
    expect(
      coderabbit.parseMessage({
        body: "## Walkthrough\n## Summary",
        kind: "comment",
      }),
    ).toBeNull();
  });
  it("keeps Greptile findings when a completion thumbs-up arrives and handles failed reactions", () => {
    expect(
      statuses({
        reviewComments: [inline(3, "greptile-apps[bot]")],
        reactions: [
          reaction("eyes", 1, 0, "greptile-apps[bot]"),
          reaction("+1", 4, 0, "greptile-apps[bot]"),
        ],
      })[0],
    ).toMatchObject({ state: "findings", durationMs: 180_000 });
    expect(
      greptile.parseMessage({
        body: "### Confidence Score: 5/5",
        kind: "comment",
      }),
    ).toBe("completed");
    expect(
      statuses({
        reactions: [reaction("confused", 2, 0, "greptile-apps[bot]")],
      })[0].state,
    ).toBe("failed");
  });
});
