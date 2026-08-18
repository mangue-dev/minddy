import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setPullRequestReviewCommentReaction } from "./pr";

/**
 * MIN-145: WITHDRAWAL of a reaction is the only gesture which must find, in
 * a list, which of the reactions is "mine" — the GitHub REST does not know how to delete without an id, and only distinguishes reactions by their author.
 *
 * What is happening here is in one sentence: **the login we pass is a cache,
 * the token is the authority.** `git_user_identities.account_login` is written at the
 * account connection and never refreshed; who renames their GitHub account keeps
 * a valid token, sees its reaction lit (`viewerHasReacted` comes from the token),
 * and could never withdraw it again if the stored name was authentic. Removing
 * would respond to `ok` without removing anything: a click with no effect, no message, to
 * repeat indefinitely.
 *
 * Payloads mimic `GET /repos/…/pulls/comments/{id}/reactions`: this is
 * the form that we parse (`user.login`, `content`, `id`).
 */

const COMMENT = 42;
const REACTIONS_URL =
  `https://api.github.com/repos/mangue-dev/minddy-issues/pulls/comments/${COMMENT}/reactions`;

interface Call {
  url: string;
  method: string;
}

let calls: Call[];
let reactions: unknown[];
let currentLogin: string;

function remove(login: string | null) {
  return setPullRequestReviewCommentReaction({
    token: "user-token",
    repoFullName: "mangue-dev/minddy-issues",
    commentId: COMMENT,
    content: "+1",
    on: false,
    login,
  });
}

const deletions = () => calls.filter((c) => c.method === "DELETE").map((c) => c.url);
const askedWhoIAm = () => calls.some((c) => c.url === "https://api.github.com/user");

beforeEach(() => {
  calls = [];
  reactions = [];
  currentLogin = "mangue-dev";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "https://api.github.com/user") {
        return new Response(JSON.stringify({ login: currentLogin }), { status: 200 });
      }
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify(reactions), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("retire la réaction du login passé, sans demander qui porte le token", async () => {
  reactions = [
    { id: 3, content: "+1", user: { login: "minddy-app[bot]" } },
    { id: 7, content: "+1", user: { login: "mangue-dev" } },
  ];

  await remove("mangue-dev");

  expect(deletions()).toEqual([`${REACTIONS_URL}/7`]);
  // The name is enough in the current case: no more round trips.
  expect(askedWhoIAm()).toBe(false);
});

it("retrouve la sienne après un renommage de compte, et n'emporte pas celle du bot", async () => {
  // The account is now called `mangue-new`; minddy has memorized `mangue-old`
  // on login day, and nothing ever fixed it.
  currentLogin = "mangue-new";
  reactions = [
    { id: 3, content: "+1", user: { login: "minddy-app[bot]" } },
    { id: 9, content: "+1", user: { login: "mangue-new" } },
  ];

  await remove("mangue-old");

  expect(askedWhoIAm()).toBe(true);
  expect(deletions()).toEqual([`${REACTIONS_URL}/9`]);
});

it("ne retire rien quand la réaction est celle de quelqu'un d'autre", async () => {
  reactions = [{ id: 3, content: "+1", user: { login: "minddy-app[bot]" } }];

  await remove("mangue-dev");

  // The stored name could be out of date: we asked the question…
  expect(askedWhoIAm()).toBe(true);
  // …and the response doesn't change anything, the bot's response stays with the bot.
  expect(deletions()).toEqual([]);
});

it("ne demande rien quand il n'y a plus aucune réaction à départager", async () => {
  reactions = [];

  await remove("mangue-dev");

  // “Already removed” is the common case of double-clicking: it should not cost
  // un appel de plus.
  expect(askedWhoIAm()).toBe(false);
  expect(deletions()).toEqual([]);
});

it("refuse d'agir sans login, avant tout appel réseau", async () => {
  // The safeguard of the ticket: a caller without an actor (therefore on the token
  // installation) would place the reaction under `minddy-app[bot]`.
  await expect(remove(null)).rejects.toThrow(/login/i);
  expect(calls).toEqual([]);
});
