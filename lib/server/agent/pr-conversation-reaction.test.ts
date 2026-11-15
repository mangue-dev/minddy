import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import {
  listPullRequestConversationReactions,
  setPullRequestConversationReaction,
} from "./pr";
import { setMergeRequestNoteAward } from "./mr";

/**
 * MIN-147: reacting works EVERYWHERE in a PR, not only on comments anchored to
 * a line of code.
 *
 * What is at stake here is ADDRESSING. Three surfaces look exactly the same on
 * screen (a review comment, a thread message, the PR body), and the forges
 * store them in three different places. A `PR_BODY_COMMENT_ID` (zero) travels
 * the whole chain to designate the body; these tests check that it lands on
 * the right URL on each forge, and that an ordinary comment id is not
 * rerouted.
 *
 * A wrong address does not show in code review: it answers 404 (or worse, puts
 * the reaction on the wrong object) the day someone clicks.
 */

const REPO = "mangue-dev/minddy-issues";
const NUMBER = 30;

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let calls: Call[];
let graphql: unknown;

beforeEach(() => {
  calls = [];
  graphql = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.endsWith("/graphql")) {
        return new Response(JSON.stringify({ data: graphql }), { status: 200 });
      }
      if (url === "https://api.github.com/user") {
        return new Response(JSON.stringify({ login: "mangue-dev" }), { status: 200 });
      }
      if (url === "https://gitlab.com/api/v4/user") {
        return new Response(JSON.stringify({ username: "mangue-dev" }), { status: 200 });
      }
      // Every award / reaction list is empty: only addressing is tested here,
      // not the toggle (covered by `pr-reaction.test.ts`).
      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const posted = () => calls.filter((c) => c.method === "POST").map((c) => c.url);

it("GitHub: a thread message is addressed as `issues/comments/{id}`", async () => {
  await setPullRequestConversationReaction({
    token: "user-token",
    repoFullName: REPO,
    number: NUMBER,
    commentId: 512,
    content: "+1",
    on: true,
    login: "mangue-dev",
  });

  expect(posted()).toEqual([
    `https://api.github.com/repos/${REPO}/issues/comments/512/reactions`,
  ]);
});

it("GitHub: the PR body is addressed as `issues/{number}`, not as a comment", async () => {
  await setPullRequestConversationReaction({
    token: "user-token",
    repoFullName: REPO,
    number: NUMBER,
    commentId: PR_BODY_COMMENT_ID,
    content: "heart",
    on: true,
    login: "mangue-dev",
  });

  // On GitHub a PR IS an issue: its body takes reactions on the issue itself.
  expect(posted()).toEqual([
    `https://api.github.com/repos/${REPO}/issues/${NUMBER}/reactions`,
  ]);
  expect(calls.at(-1)?.body).toEqual({ content: "heart" });
});

it("GitLab: a note keeps its URL, the MR body uses the MR's own", async () => {
  const award = (commentId: number) =>
    setMergeRequestNoteAward({
      token: "user-token",
      repoFullName: REPO,
      number: NUMBER,
      commentId,
      content: "rocket",
      on: true,
      login: "mangue-dev",
    });

  await award(77);
  await award(PR_BODY_COMMENT_ID);

  const base = `https://gitlab.com/api/v4/projects/${encodeURIComponent(REPO)}/merge_requests/${NUMBER}`;
  expect(posted()).toEqual([`${base}/notes/77/award_emoji`, `${base}/award_emoji`]);
});

it("GitHub: body reactions come out under id zero, message reactions under their own id", async () => {
  const group = (content: string, count: number, viewer = false) => ({
    content,
    viewerHasReacted: viewer,
    reactors: { totalCount: count },
  });
  graphql = {
    repository: {
      pullRequest: {
        reactionGroups: [group("THUMBS_UP", 2, true), group("EYES", 0)],
        comments: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ databaseId: 512, reactionGroups: [group("ROCKET", 1)] }],
        },
      },
    },
  };

  const reactions = await listPullRequestConversationReactions({
    token: "user-token",
    repoFullName: REPO,
    number: NUMBER,
    viewerIsActor: true,
  });

  expect(reactions).toEqual([
    // `EYES` is dropped: a zero-count group briefly outlives the removal of its
    // last reaction, and displaying it would show an emoji nobody added.
    { commentId: PR_BODY_COMMENT_ID, content: "+1", count: 2, mine: true },
    { commentId: 512, content: "rocket", count: 1, mine: false },
  ]);
});

it("GitHub: without an actor no reaction is marked as mine, and counts stay correct", async () => {
  graphql = {
    repository: {
      pullRequest: {
        // The installation token's `viewerHasReacted` belongs to the BOT: passing
        // it through would light up, for everyone, a reaction nobody added.
        reactionGroups: [
          { content: "THUMBS_UP", viewerHasReacted: true, reactors: { totalCount: 3 } },
        ],
        comments: { pageInfo: { hasNextPage: false }, nodes: [] },
      },
    },
  };

  const reactions = await listPullRequestConversationReactions({
    token: "install-token",
    repoFullName: REPO,
    number: NUMBER,
    viewerIsActor: false,
  });

  expect(reactions).toEqual([
    { commentId: PR_BODY_COMMENT_ID, content: "+1", count: 3, mine: false },
  ]);
});

it("GitHub: the body is counted once, even when messages paginate", async () => {
  const body = {
    content: "HOORAY",
    viewerHasReacted: false,
    reactors: { totalCount: 1 },
  };
  let page = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.endsWith("/graphql")) return new Response("[]", { status: 200 });
      const first = page++ === 0;
      return new Response(
        JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reactionGroups: [body],
                comments: {
                  pageInfo: { hasNextPage: first, endCursor: first ? "c1" : null },
                  nodes: [{ databaseId: first ? 1 : 2, reactionGroups: [] }],
                },
              },
            },
          },
        }),
        { status: 200 },
      );
    }),
  );

  const reactions = await listPullRequestConversationReactions({
    token: "user-token",
    repoFullName: REPO,
    number: NUMBER,
    viewerIsActor: true,
  });

  // The body belongs to the PR, not to its comment pagination: reading it
  // again on each page would double its displayed count.
  expect(page).toBe(2);
  expect(reactions).toEqual([
    { commentId: PR_BODY_COMMENT_ID, content: "hooray", count: 1, mine: false },
  ]);
});
