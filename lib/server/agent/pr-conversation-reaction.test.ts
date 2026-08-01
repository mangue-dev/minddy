import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PR_BODY_COMMENT_ID } from "@/lib/pr-review-reactions";
import {
  listPullRequestConversationReactions,
  setPullRequestConversationReaction,
} from "./pr";
import { setMergeRequestNoteAward } from "./mr";

/**
 * MIN-147 : réagir marche PARTOUT dans une PR, plus seulement sur les
 * commentaires ancrés à une ligne de code.
 *
 * Ce qui se joue ici est une question d'ADRESSE. Trois surfaces se rendent
 * exactement pareil à l'écran — un commentaire de review, un message du fil, le
 * corps de la PR — et les forges les rangent à trois endroits différents. Un
 * `PR_BODY_COMMENT_ID` (zéro) traverse toute la chaîne pour désigner le corps ;
 * ces tests vérifient qu'il atterrit sur la bonne URL de chaque côté, et qu'un id
 * de commentaire ordinaire, lui, ne bascule pas.
 *
 * Une adresse fausse ne se voit pas en relisant : elle répond 404 (ou pire, pose
 * la réaction sur le mauvais objet) le jour où quelqu'un clique.
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
      // Toute liste d'awards / de réactions est vide : on ne teste ici que
      // l'adressage, pas la bascule (couverte par `pr-reaction.test.ts`).
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

  // Une PR EST une issue chez GitHub : son corps se réagit sur l'issue elle-même.
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
    // `EYES` est tombé : un groupe à zéro survit un instant au retrait de sa
    // dernière réaction, et l'afficher rendrait un emoji que personne n'a posé.
    { commentId: PR_BODY_COMMENT_ID, content: "+1", count: 2, mine: true },
    { commentId: 512, content: "rocket", count: 1, mine: false },
  ]);
});

it("GitHub : sans acteur, aucune réaction n'est « la mienne » — les comptes restent justes", async () => {
  graphql = {
    repository: {
      pullRequest: {
        // Le `viewerHasReacted` du token d'installation est celui du BOT : le
        // rendre tel quel allumerait chez chacun une réaction que personne n'a posée.
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

  // Le corps est porté par la PR, pas par la pagination de ses commentaires :
  // le relire à chaque page doublerait son compte à l'écran.
  expect(page).toBe(2);
  expect(reactions).toEqual([
    { commentId: PR_BODY_COMMENT_ID, content: "hooray", count: 1, mine: false },
  ]);
});
