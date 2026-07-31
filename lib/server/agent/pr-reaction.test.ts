import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setPullRequestReviewCommentReaction } from "./pr";

/**
 * MIN-145 : le RETRAIT d'une réaction est le seul geste qui doit retrouver, dans
 * une liste, laquelle des réactions est « la mienne » — la REST GitHub ne sait
 * pas supprimer sans id, et ne distingue les réactions que par leur auteur.
 *
 * Ce qui se joue ici tient en une phrase : **le login qu'on passe est un cache,
 * le token est l'autorité.** `git_user_identities.account_login` est écrit à la
 * connexion du compte et jamais rafraîchi ; qui renomme son compte GitHub garde
 * un token valide, voit sa réaction allumée (`viewerHasReacted` vient du token),
 * et ne pourrait plus jamais la retirer si le nom stocké faisait foi. Le retrait
 * répondrait `ok` sans rien retirer : un clic sans effet, sans message, à
 * répéter indéfiniment.
 *
 * Les charges utiles imitent `GET /repos/…/pulls/comments/{id}/reactions` : c'est
 * la forme qu'on parse (`user.login`, `content`, `id`).
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
  // Le nom suffit dans le cas courant : pas d'aller-retour de plus.
  expect(askedWhoIAm()).toBe(false);
});

it("retrouve la sienne après un renommage de compte, et n'emporte pas celle du bot", async () => {
  // Le compte s'appelle maintenant `mangue-new` ; minddy a mémorisé `mangue-old`
  // le jour de la connexion, et rien ne l'a jamais corrigé.
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

  // Le nom stocké pouvait être périmé : on a posé la question…
  expect(askedWhoIAm()).toBe(true);
  // …et la réponse ne change rien, celle du bot reste au bot.
  expect(deletions()).toEqual([]);
});

it("ne demande rien quand il n'y a plus aucune réaction à départager", async () => {
  reactions = [];

  await remove("mangue-dev");

  // « Déjà retirée » est le cas courant du double-clic : il ne doit pas coûter
  // un appel de plus.
  expect(askedWhoIAm()).toBe(false);
  expect(deletions()).toEqual([]);
});

it("refuse d'agir sans login, avant tout appel réseau", async () => {
  // Le garde-fou du ticket : un appelant sans acteur (donc sur le token
  // d'installation) poserait la réaction sous `minddy-app[bot]`.
  await expect(remove(null)).rejects.toThrow(/login/i);
  expect(calls).toEqual([]);
});
