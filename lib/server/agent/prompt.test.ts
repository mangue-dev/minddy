import { describe, expect, it } from "vitest";
import { buildInheritedBranchMessage, buildInheritedPrMessage } from "./prompt";

/**
 * Message d'amorce d'une run FROIDE qui hérite d'une PR (MIN-68). C'est la seule
 * mémoire qu'a la run neuve du travail déjà poussé sur la branche : si un morceau
 * saute, l'agent recommence le ticket à zéro par-dessus une PR en revue.
 */

const repo = {
  fullName: "acme/app",
  defaultBranch: "main",
  workBranch: "minddy/agent/min-42-abcd1234",
};

describe("buildInheritedPrMessage", () => {
  it("porte la PR, la branche et l'ordre de ne pas repartir de zéro", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, title: "MIN-42: add search", state: "open", comments: [] },
    });
    expect(msg).toContain("#12");
    expect(msg).toContain("MIN-42: add search");
    expect(msg).toContain(repo.workBranch);
    expect(msg).toMatch(/do NOT start the ticket over/i);
    // Le diff n'est jamais inliné : l'agent lit la branche lui-même, et le fait
    // avec une commande qui survit au clone shallow (pas de three-dot).
    expect(msg).toContain("git diff main");
    expect(msg).not.toContain("main...");
  });

  it("injecte le résumé de la run précédente", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        previousSummary: "Ajout du champ de recherche et de son index.",
      },
    });
    expect(msg).toContain("Ajout du champ de recherche et de son index.");
  });

  it("injecte la description de la PR (ce que la PR annonce déjà)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        body: "Ajoute /api/search et son index trigram.",
      },
    });
    expect(msg).toContain("Ajoute /api/search et son index trigram.");
  });

  it("plafonne la description et le résumé (contexte hérité borné)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [],
        body: "b".repeat(9000),
        previousSummary: "s".repeat(9000),
      },
    });
    // Chacun est tronqué à 4000 : aucun des deux ne passe en entier.
    expect(msg).not.toContain("b".repeat(4100));
    expect(msg).not.toContain("s".repeat(4100));
    expect(msg.split("[truncated]").length - 1).toBe(2);
  });

  it("injecte les commentaires de review avec leur auteur", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: {
        number: 12,
        state: "open",
        comments: [
          { author: "alice", body: "Le debounce manque." },
          { author: "bob", body: "Renomme `q` en `query`." },
        ],
      },
    });
    expect(msg).toContain("@alice");
    expect(msg).toContain("Le debounce manque.");
    expect(msg).toContain("@bob");
  });

  it("ne garde que les 10 commentaires les plus RÉCENTS (la demande du jour)", () => {
    const comments = Array.from({ length: 14 }, (_, i) => ({
      author: "alice",
      body: `comment-${i}`,
    }));
    const msg = buildInheritedPrMessage({ repo, pr: { number: 12, state: "open", comments } });
    expect(msg).not.toContain("comment-3");
    expect(msg).toContain("comment-4");
    expect(msg).toContain("comment-13");
  });

  it("annonce une PR REFUSÉE comme telle, et sa réouverture au push", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "closed", comments: [] },
    });
    expect(msg).toMatch(/REJECTED/);
    expect(msg).toMatch(/reopen/i);
  });

  it("ne parle pas de refus quand la PR est ouverte", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "open", comments: [] },
    });
    expect(msg).not.toMatch(/REJECTED/);
  });

  it("tronque un commentaire fleuve au cap par commentaire (2000)", () => {
    const msg = buildInheritedPrMessage({
      repo,
      pr: { number: 12, state: "open", comments: [{ author: "alice", body: "x".repeat(9000) }] },
    });
    expect(msg).toContain("[truncated]");
    // Le cap est à 2000 : 2100 « x » d'affilée ne peuvent pas survivre.
    expect(msg).toContain("x".repeat(2000));
    expect(msg).not.toContain("x".repeat(2100));
  });
});

/**
 * Variante SANS PR : depuis que l'héritage est indexé sur la branche (la création
 * de PR est une décision), une run froide peut reprendre une branche qui porte du
 * travail jamais mis en PR. Ce message est sa seule mémoire de ce passé.
 */
describe("buildInheritedBranchMessage", () => {
  it("porte la branche, l'absence de PR et l'ordre de ne pas repartir de zéro", () => {
    const msg = buildInheritedBranchMessage({ repo });
    expect(msg).toContain(repo.workBranch);
    expect(msg).toMatch(/No pull request exists yet/i);
    expect(msg).toMatch(/do NOT start the ticket over/i);
    // Même contrainte de clone shallow que le message PR.
    expect(msg).toContain("git diff main");
    expect(msg).not.toContain("main...");
  });

  it("injecte le résumé de la session précédente, plafonné", () => {
    const msg = buildInheritedBranchMessage({
      repo,
      previousSummary: "Ajout du champ de recherche.",
    });
    expect(msg).toContain("Ajout du champ de recherche.");

    const capped = buildInheritedBranchMessage({ repo, previousSummary: "s".repeat(9000) });
    expect(capped).not.toContain("s".repeat(4100));
    expect(capped).toContain("[truncated]");
  });
});
