import { describe, expect, it } from "vitest";

import { localRunScope, rowMayRunLocally } from "./local-exec-scope";

/**
 * MIN-360 — L'INVARIANT DES RUNS À CONTENU TIERS.
 *
 * Logique PURE, testée comme [prune.test.ts](prune.test.ts) : on appelle, on
 * assert. Ce qu'elle décide, en revanche, n'a rien de mineur — un run dont le
 * contexte est du texte d'attaquant potentiel qui partirait sur une machine
 * locale, c'est une injection de prompt qui devient un shell sur l'ordinateur du
 * développeur.
 *
 * Le cas qui a motivé le module est le dernier de ce fichier : `job.interactive`
 * vaut `!run.routine_id`, donc **vrai** pour une relecture de pull request
 * déclenchée par un webhook.
 */

const ctx = (over: Partial<Parameters<typeof localRunScope>[0]> = {}) => ({
  triggeredBy: "button" as const,
  ...over,
});

describe("localRunScope", () => {
  it("laisse passer ce que la personne lance elle-même", () => {
    expect(localRunScope(ctx())).toEqual({ ok: true });
    expect(localRunScope(ctx({ triggeredBy: "chat" }))).toEqual({ ok: true });
  });

  it("refuse une relecture de pull request", () => {
    // Le diff et les commentaires d'un fork sont écrits par n'importe qui. Le
    // dépôt le reconnaît déjà en refusant un token `repo-write` à ces sessions.
    expect(localRunScope(ctx({ pullRequestId: "pr-1" }))).toEqual({
      ok: false,
      reason: "pull_request",
    });
  });

  it("refuse ce que personne n'a devant les yeux", () => {
    expect(localRunScope(ctx({ routineId: "r-1" }))).toEqual({ ok: false, reason: "routine" });
    expect(localRunScope(ctx({ chainId: "c-1" }))).toEqual({ ok: false, reason: "chain" });
    expect(localRunScope(ctx({ triggeredBy: "automation" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
    expect(localRunScope(ctx({ triggeredBy: "routine" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
  });

  it("refuse une mention, même quand elle a l'air interne", () => {
    // Une mention peut venir d'un commentaire de forge recopié par un webhook, et
    // rien à cet endroit ne distingue les deux.
    expect(localRunScope(ctx({ triggeredBy: "mention" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
  });

  it("refuse une source qu'il ne connaît pas — la liste est FERMÉE", () => {
    // La porte d'entrée qu'on écrira l'an prochain (board public, webhook d'un
    // autre forge) doit être refusée par défaut, pas autorisée par oubli.
    expect(localRunScope(ctx({ triggeredBy: "feedback_board" }))).toEqual({
      ok: false,
      reason: "trigger",
    });
    expect(localRunScope(ctx({ triggeredBy: "" }))).toEqual({ ok: false, reason: "trigger" });
  });

  it("refuse dès la PREMIÈRE raison, et la nomme", () => {
    // Un run de chaîne SUR une pull request : le motif rendu est celui qui se
    // raconte le mieux, et l'ordre est stable pour que les logs le soient aussi.
    expect(localRunScope(ctx({ pullRequestId: "pr-1", chainId: "c-1" }))).toEqual({
      ok: false,
      reason: "pull_request",
    });
  });
});

describe("rowMayRunLocally", () => {
  it("pose la même question d'une ligne de la base", () => {
    expect(
      rowMayRunLocally({
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: null,
      }),
    ).toEqual({ ok: true });
    expect(
      rowMayRunLocally({
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: "pr-1",
      }),
    ).toEqual({ ok: false, reason: "pull_request" });
  });

  it("refuse une ligne muette", () => {
    // Une colonne absente n'est pas une autorisation : c'est une ignorance.
    expect(rowMayRunLocally({})).toEqual({ ok: false, reason: "trigger" });
  });
});
