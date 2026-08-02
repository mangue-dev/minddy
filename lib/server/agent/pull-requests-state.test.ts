import { describe, expect, it } from "vitest";
import { prStateFromRef } from "./pull-requests";
import type { PullRequestRef } from "./pr";

/**
 * `prStateFromRef` — « ce que l'API de la forge répond » → état minddy. C'est la
 * TROISIÈME des trois règles d'état (avec `githubPrState` / `gitlabMrState`, qui
 * lisent des payloads de webhook), et la seule qui parle le vocabulaire NEUTRE
 * de `PullRequestRef` : les deux forges y arrivent déjà normalisées par leur
 * `toRef` respectif.
 *
 * Elle porte les chemins les plus récents — la réouverture in-app (`pr-actions`,
 * qui lit l'état sur la PR que la forge renvoie plutôt que de le supposer
 * `open`) et la réconciliation du balayage (`syncRepoPullRequests`) — plus
 * `registerPr` et le prompt d'héritage. Se tromper ici ne lève rien : ça déplace
 * un ticket.
 *
 * L'ORDRE est tout ce qu'elle affirme, et il tient en deux phrases : fusionnée
 * l'emporte sur fermée, et un brouillon n'est un brouillon que tant qu'il est
 * ouvert.
 */

const ref = (over: Partial<PullRequestRef>): PullRequestRef => ({
  number: 12,
  url: "https://example.test/pull/12",
  state: "open",
  ...over,
});

describe("prStateFromRef", () => {
  it("fusionnée l'emporte sur fermée — les deux forges ferment en fusionnant", () => {
    // GitHub : `state: "closed"` + `merged: true`. GitLab : `toRef` traduit
    // `state: "merged"` en `state: "closed"` + `merged: true`.
    expect(prStateFromRef(ref({ state: "closed", merged: true }))).toBe("merged");
    expect(prStateFromRef(ref({ state: "closed" }))).toBe("closed");
  });

  it("un brouillon n'est brouillon que tant qu'il est OUVERT", () => {
    expect(prStateFromRef(ref({ state: "open", draft: true }))).toBe("draft");
    // GitHub NE RETIRE PAS `draft` en fermant : l'annoncer « brouillon »
    // cacherait qu'il est mort, et le ticket repartirait « en cours » au lieu
    // d'« à faire ». C'est le cas qui a motivé MIN-164.
    expect(prStateFromRef(ref({ state: "closed", draft: true }))).toBe("closed");
    // Idem d'une PR brouillon fusionnée (rare, mais GitHub l'autorise après
    // `ready_for_review` côté API).
    expect(prStateFromRef(ref({ state: "closed", draft: true, merged: true }))).toBe("merged");
  });

  it("tout le reste est ouvert — `locked` compris (déjà traduit par `toRef`)", () => {
    expect(prStateFromRef(ref({ state: "open" }))).toBe("open");
    expect(prStateFromRef(ref({ state: "open", draft: false, merged: false }))).toBe("open");
  });
});
