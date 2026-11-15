import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setPullRequestReviewCommentReaction } from "./pr";

/**
 * MIN-145: REMOVING a reaction is the only action that must find, in a list,
 * which reaction is "mine": GitHub's REST API cannot delete without an id, and
 * tells reactions apart only by their author.
 *
 * It comes down to one sentence: **the login we pass is a cache, the token is
 * the authority.** `git_user_identities.account_login` is written when the
 * account is linked and never refreshed. Someone who renames their GitHub
 * account keeps a valid token and sees their reaction lit (`viewerHasReacted`
 * comes from the token), but could never remove it if the stored name were
 * authoritative. Removal would answer `ok` without removing anything: a click
 * with no effect and no message, repeated forever.
 *
 * Payloads mimic `GET /repos/…/pulls/comments/{id}/reactions`, the shape we
 * parse (`user.login`, `content`, `id`).
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

it("removes the passed login's reaction without asking who owns the token", async () => {
  reactions = [
    { id: 3, content: "+1", user: { login: "minddy-app[bot]" } },
    { id: 7, content: "+1", user: { login: "mangue-dev" } },
  ];

  await remove("mangue-dev");

  expect(deletions()).toEqual([`${REACTIONS_URL}/7`]);
  // The name is enough in the common case: no extra round trip.
  expect(askedWhoIAm()).toBe(false);
});

it("finds its own reaction after an account rename and leaves the bot's alone", async () => {
  // The account is now called `mangue-new`; minddy stored `mangue-old` on the
  // day it was linked, and nothing ever corrected it.
  currentLogin = "mangue-new";
  reactions = [
    { id: 3, content: "+1", user: { login: "minddy-app[bot]" } },
    { id: 9, content: "+1", user: { login: "mangue-new" } },
  ];

  await remove("mangue-old");

  expect(askedWhoIAm()).toBe(true);
  expect(deletions()).toEqual([`${REACTIONS_URL}/9`]);
});

it("removes nothing when the reaction belongs to someone else", async () => {
  reactions = [{ id: 3, content: "+1", user: { login: "minddy-app[bot]" } }];

  await remove("mangue-dev");

  // The stored name may be stale, so the question was asked…
  expect(askedWhoIAm()).toBe(true);
  // …and the answer changes nothing: the bot's reaction stays with the bot.
  expect(deletions()).toEqual([]);
});

it("asks nothing when no reaction is left to tell apart", async () => {
  reactions = [];

  await remove("mangue-dev");

  // “Already removed” is the usual double-click case: it must not cost an
  // extra call.
  expect(askedWhoIAm()).toBe(false);
  expect(deletions()).toEqual([]);
});

it("refuses to act without a login, before any network call", async () => {
  // The issue's safeguard: a caller without an actor (and so on the
  // installation token) would put the reaction under `minddy-app[bot]`.
  await expect(remove(null)).rejects.toThrow(/login/i);
  expect(calls).toEqual([]);
});
