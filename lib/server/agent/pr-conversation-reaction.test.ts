import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import {
  listPullRequestConversationReactions,
  setPullRequestConversationReaction,
} from "./pr";
import { setMergeRequestNoteAward } from "./mr";

/**
 * MIN-147: react works EVERYWHERE in a PR, no longer only on
 * comments anchored to a line of code.
 *
 * What is at stake here is a question of ADDRESS. Three surfaces render
 * exactly the same on the screen — a review comment, a thread message, the
 * body of the PR — and the forges store them in three different places. A
 * `PR_BODY_COMMENT_ID` (zero) traverses the entire chain to designate the body;
 * these tests verify that it lands on the correct URL on each side, and that an ordinary comment id
 * does not switch.
 *
 * An address false is not seen when rereading: it responds 404 (or worse, puts
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
      // Any list of awards / reactions is empty: we only test here
      // addressing, not the flip-flop (covered by `pr-reaction.test.ts`).
      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const posted = () => calls.filter((c) => c.method === "POST").map((c) => c.url);

it("GitHub : un message du fil s'adresse en `issues/comments/{id}`", async () => {
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

it("GitHub : le corps de la PR s'adresse en `issues/{number}` — pas en commentaire", async () => {
  await setPullRequestConversationReaction({
    token: "user-token",
    repoFullName: REPO,
    number: NUMBER,
    commentId: PR_BODY_COMMENT_ID,
    content: "heart",
    on: true,
    login: "mangue-dev",
  });

  // A PR IS an issue at GitHub: his body reacts to the issue itself.
  expect(posted()).toEqual([
    `https://api.github.com/repos/${REPO}/issues/${NUMBER}/reactions`,
  ]);
  expect(calls.at(-1)?.body).toEqual({ content: "heart" });
});

it("GitLab : la note garde son URL, le corps de la MR prend celle de la MR", async () => {
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

it("GitHub : les réactions du corps sortent sous l'id zéro, celles des messages sous le leur", async () => {
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
    // `EYES` has fallen: a group with zero survives for an instant the removal of its
    // last reaction, and displaying it would render an emoji that no one asked.
    { commentId: PR_BODY_COMMENT_ID, content: "+1", count: 2, mine: true },
    { commentId: 512, content: "rocket", count: 1, mine: false },
  ]);
});

it("GitHub : sans acteur, aucune réaction n'est « la mienne » — les comptes restent justes", async () => {
  graphql = {
    repository: {
      pullRequest: {
        // The `viewerHasReacted` of the installation token is that of the BOT: the
        // making it as it is would trigger a reaction in everyone that no one has asked.
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

it("GitHub : le corps n'est compté qu'une fois, même quand les messages paginent", async () => {
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

  // The body is carried by the PR, not by the pagination of its comments:
  // rereading it on each page would double its screen count.
  expect(page).toBe(2);
  expect(reactions).toEqual([
    { commentId: PR_BODY_COMMENT_ID, content: "hooray", count: 1, mine: false },
  ]);
});
