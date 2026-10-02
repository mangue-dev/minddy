import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listPullRequestComments,
  listPullRequestConversationReactions,
} from "./pr";

const options = {
  token: "token",
  repoFullName: "acme/app",
  number: 1,
  viewerIsActor: false,
};
const group = {
  content: "EYES",
  reactors: { totalCount: 103 },
  viewerHasReacted: true,
};
const at = "2026-10-02T10:00:00Z";
const json = (data: unknown) => Response.json({ data });

afterEach(() => vi.unstubAllGlobals());

describe("reviewer reaction transport", () => {
  it("preserves counts and viewer state while retaining only provider-relevant, dated bot reactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          repository: {
            pullRequest: {
              reactionGroups: [group],
              reactions: {
                nodes: [
                  { content: "EYES", createdAt: at, user: { login: "ada" } },
                  {
                    content: "EYES",
                    createdAt: at,
                    user: { login: "chatgpt-codex-connector" },
                  },
                  {
                    content: "EYES",
                    createdAt: at,
                    user: { login: "chatgpt-codex-connector[bot]" },
                  },
                  {
                    content: "EYES",
                    user: { login: "chatgpt-codex-connector[bot]" },
                  },
                ],
              },
              comments: { nodes: [] },
            },
          },
        }),
      ),
    );
    expect(await listPullRequestConversationReactions(options)).toEqual([
      {
        commentId: 0,
        content: "eyes",
        count: 103,
        mine: false,
        reviewerActors: [
          { login: "chatgpt-codex-connector[bot]", createdAt: at },
        ],
      },
    ]);
    expect(
      await listPullRequestConversationReactions({
        ...options,
        viewerIsActor: true,
      }),
    ).toMatchObject([{ mine: true }]);
  });
  it("finds bots beyond the first reaction page on both PR bodies and request comments", async () => {
    const pages: Record<string, number> = {};
    const mock = vi.fn(async (_url: string, init: RequestInit) => {
      const { query, variables } = JSON.parse(String(init.body));
      if (variables.id) {
        pages[variables.id] = (pages[variables.id] ?? 0) + 1;
        expect(variables.cursor).toBe("next");
        expect(query).toContain("... on PullRequest");
        expect(query).toContain("... on IssueComment");
        return json({
          node: {
            reactions: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  content: "EYES",
                  createdAt: at,
                  user: { login: "chatgpt-codex-connector[bot]" },
                },
              ],
            },
          },
        });
      }
      expect(query).toContain("nodes{content createdAt user{login}}");
      const subject = (id: string, databaseId: number) => ({
        id,
        databaseId,
        reactionGroups: [group],
        reactions: {
          pageInfo: { hasNextPage: true, endCursor: "next" },
          nodes: Array.from({ length: 100 }, () => ({
            content: "EYES",
            createdAt: at,
            user: { login: "ada" },
          })),
        },
      });
      return json({
        repository: {
          pullRequest: {
            ...subject("PR_1", 1),
            comments: { nodes: [subject("IC_2", 2)] },
          },
        },
      });
    });
    vi.stubGlobal("fetch", mock);
    const result = await listPullRequestConversationReactions(options);
    expect(pages).toEqual({ PR_1: 1, IC_2: 1 });
    expect(
      result.map((reaction) => [
        reaction.commentId,
        reaction.reviewerActors?.[0].login,
      ]),
    ).toEqual([
      [0, "chatgpt-codex-connector[bot]"],
      [2, "chatgpt-codex-connector[bot]"],
    ]);
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it("retains existing reaction counts if a reviewer enrichment page fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            repository: {
              pullRequest: {
                id: "PR_1",
                reactionGroups: [group],
                reactions: {
                  pageInfo: { hasNextPage: true, endCursor: "next" },
                  nodes: [],
                },
                comments: { nodes: [] },
              },
            },
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ errors: [{ message: "Unavailable" }] }),
        ),
    );
    try {
      expect(await listPullRequestConversationReactions(options)).toEqual([
        { commentId: 0, content: "eyes", count: 103, mine: false },
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it("does not duplicate the PR body's reviewer when conversation comments paginate", async () => {
    let page = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          repository: {
            pullRequest: {
              reactionGroups: [group],
              reactions: {
                nodes: [
                  {
                    content: "EYES",
                    createdAt: at,
                    user: { login: "chatgpt-codex-connector[bot]" },
                  },
                ],
              },
              comments: {
                pageInfo: { hasNextPage: page++ === 0, endCursor: "page2" },
                nodes: [],
              },
            },
          },
        }),
      ),
    );
    const result = await listPullRequestConversationReactions(options);
    expect(result).toHaveLength(1);
    expect(result[0].reviewerActors).toHaveLength(1);
  });
  it("follows comment pages so late review requests can be matched to their reactions", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          Array.from({ length: 100 }, (_, id) => ({
            id,
            body: "hello",
            created_at: at,
          })),
        ),
      )
      .mockResolvedValueOnce(
        Response.json([{ id: 101, body: "@codex review", created_at: at }]),
      );
    vi.stubGlobal("fetch", mock);
    const comments = await listPullRequestComments(options);
    expect(comments.at(-1)).toMatchObject({ id: 101, body: "@codex review" });
    expect(mock.mock.calls[1][0]).toContain("page=2");
  });
});
