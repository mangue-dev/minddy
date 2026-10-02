import { describe, expect, it } from "vitest";
import { buildAiReviewStatuses } from "./pr-ai-review";
import {
  AI_REVIEW_PROVIDERS,
  aiReviewProviderForLogin,
} from "./pr-ai-review/providers";
import type { ReviewCommentReaction } from "./pr-review-reactions";
import type { PullRequestComment, PullRequestReviewComment } from "./agent-api";
import type { PrTimelineEvent } from "./pr-timeline";
import type { ReviewThreadState } from "./pr-review-threads";

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
    reviewThreads: [],
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

const thread = (
  rootCommentId: number,
  resolved = true,
  outdated = false,
): ReviewThreadState => ({
  rootCommentId,
  threadId: `thread:${rootCommentId}`,
  resolved,
  resolvedBy: resolved ? "ada" : null,
  outdated,
});

describe("resolved AI review findings", () => {
  it.each(AI_REVIEW_PROVIDERS)(
    "settles $name only when all its reported threads are resolved",
    (provider) => {
      const login = provider.githubLogins[0];
      const input = {
        timeline: [
          {
            ...review(4, login, "Fix these issues", "changes_requested"),
            reviewId: 2,
          },
        ],
        reviewComments: [inline(2, login), inline(3, login)],
      };
      for (const reviewThreads of [
        [],
        [thread(2)],
        [thread(2), thread(3, false)],
      ]) {
        expect(statuses({ ...input, reviewThreads })[0].state).toBe("findings");
      }
      expect(
        statuses({ ...input, reviewThreads: [thread(2), thread(3)] })[0],
      ).toMatchObject({
        state: "completed",
        updatedAt: date(4),
        url: input.timeline[0].url,
      });
      expect(
        statuses({ ...input, reviewThreads: [thread(2, false), thread(3)] })[0]
          .state,
      ).toBe("findings");
    },
  );
  it("does not mistake an outdated thread or a reply for a resolved finding", () => {
    expect(
      statuses({
        reviewComments: [inline(2), inline(3, bot, true)],
        reviewThreads: [thread(2, false, true), thread(3)],
      })[0].state,
    ).toBe("findings");
  });
  it("keeps earlier open findings red even when a later finding is resolved", () => {
    expect(
      statuses({
        reviewComments: [inline(2), inline(3)],
        reviewThreads: [thread(2, false), thread(3)],
      })[0].state,
    ).toBe("findings");
  });
  it("resolves each provider independently of human and other bot threads", () => {
    expect(
      statuses({
        reviewComments: [
          inline(2),
          inline(3, "ada"),
          inline(4, "coderabbitai[bot]"),
        ],
        reviewThreads: [thread(2), thread(3, false), thread(4, false)],
      }).map((status) => [status.provider.id, status.state]),
    ).toEqual([
      ["codex", "completed"],
      ["coderabbit", "findings"],
    ]);
  });
  it("leaves a new request or running review active after resolving earlier findings", () => {
    const input = {
      comments: [comment(1, "@codex review", 5)],
      reviewComments: [inline(2)],
      reviewThreads: [thread(2)],
    };
    expect(statuses(input)[0].state).toBe("requested");
    expect(
      statuses({ ...input, reactions: [reaction("eyes", 6, 1)] })[0].state,
    ).toBe("running");
  });
  it("does not let old resolved findings settle a newer review without matching threads", () => {
    expect(
      statuses({
        reviewComments: [inline(2)],
        reviewThreads: [thread(2)],
        timeline: [
          {
            ...review(5, bot, "New findings", "changes_requested"),
            reviewId: 9,
          },
        ],
      })[0].state,
    ).toBe("findings");
  });
  it("does not carry earlier unresolved findings into a new review cycle", () => {
    expect(
      statuses({
        comments: [comment(1, "@codex review", 5)],
        reviewComments: [inline(2), { ...inline(7), review_id: 9 }],
        reviewThreads: [thread(2, false), thread(7)],
        reactions: [reaction("eyes", 6, 1)],
        timeline: [
          {
            ...review(8, bot, "Fix this issue", "changes_requested"),
            reviewId: 9,
          },
        ],
      })[0].state,
    ).toBe("completed");
  });
  it("matches every finding in a grouped review before settling completion", () => {
    const input = {
      timeline: [
        {
          ...review(5, bot, "Fix these issues", "changes_requested"),
          reviewIds: [2, 9],
        },
      ],
      reviewComments: [inline(2), { ...inline(3), review_id: 9 }],
      reactions: [reaction("eyes", 1)],
    };
    expect(
      statuses({ ...input, reviewThreads: [thread(2), thread(3, false)] })[0]
        .state,
    ).toBe("findings");
    expect(
      statuses({ ...input, reviewThreads: [thread(2), thread(3)] })[0],
    ).toMatchObject({
      state: "completed",
      startedAt: date(1),
      updatedAt: date(5),
      durationMs: 240_000,
    });
  });
  it("keeps summary-only findings red when they have no resolvable thread", () => {
    expect(
      statuses({
        comments: [
          comment(1, "Codex Review: Here are some suggestions.", 3, bot),
        ],
        reviewComments: [inline(2)],
        reviewThreads: [thread(2)],
      })[0].state,
    ).toBe("findings");
  });
  it("preserves the review timing when its findings are resolved", () => {
    const input = {
      reactions: [reaction("eyes", 1)],
      reviewComments: [inline(3)],
    };
    const before = statuses(input)[0];
    expect(statuses({ ...input, reviewThreads: [thread(3)] })[0]).toEqual({
      ...before,
      state: "completed",
    });
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
  it.each(["````", "~~~~"])(
    "keeps nested examples inside a %s fence from creating review cards",
    (fence) => {
      const innerFence = fence.slice(1);
      const body = [
        `${fence}markdown`,
        innerFence,
        ...AI_REVIEW_PROVIDERS.map((provider) => provider.requestCommand),
        innerFence,
        fence,
      ].join("\n");
      expect(statuses({ comments: [comment(1, body)] })).toEqual([]);
    },
  );
  it.each(["````", "~~~~"])(
    "requires a valid closing delimiter for a %s fence",
    (fence) => {
      for (const provider of AI_REVIEW_PROVIDERS) {
        const otherFence = fence[0] === "`" ? "~~~~" : "````";
        for (const invalidCloser of [
          fence.slice(1),
          otherFence,
          `${fence}text`,
        ]) {
          expect(
            provider.isRequest(
              [`${fence}markdown`, invalidCloser, provider.requestCommand].join(
                "\n",
              ),
            ),
          ).toBe(false);
        }
        for (const closer of [fence, `${fence}${fence[0]}  `]) {
          expect(
            provider.isRequest(
              [`${fence}markdown`, closer, provider.requestCommand].join("\n"),
            ),
          ).toBe(true);
        }
      }
    },
  );
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
