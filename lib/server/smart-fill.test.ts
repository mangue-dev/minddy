import { describe, expect, it } from "vitest";

import {
  buildSmartFillPrompt,
  sanitizeSmartFill,
  type SmartFillContext,
} from "./smart-fill";

/**
 * LA WHITELIST, exercée sur ce qu'un petit modèle rend vraiment.
 *
 * Smart-fill écrit dans un ticket sans que personne ne relise : tout ce qu'il
 * pose est passé par `sanitizeSmartFill`, et c'est donc le seul endroit du
 * chemin où une réponse de travers peut être arrêtée. Les cas ci-dessous sont
 * ceux qu'on voit en vrai — un id inventé, un enum voisin mais faux, un ticket
 * rangé dans huit catégories, un `null` qui veut dire quelque chose.
 */

const CTX: SmartFillContext = {
  categories: [
    { id: "cat-bug", name: "Bug" },
    { id: "cat-feat", name: "Fonctionnalité" },
    { id: "cat-tech", name: "Technique" },
    { id: "cat-doc", name: "Documentation" },
  ],
  objectives: [
    { id: "obj-v2", name: "Refonte v2", status: "in_progress" },
    { id: "obj-seo", name: "SEO", status: "planned" },
  ],
};

describe("sanitizeSmartFill", () => {
  it("garde une réponse complète et bien formée", () => {
    expect(
      sanitizeSmartFill(
        {
          priority: "high",
          effort: "m",
          category_ids: ["cat-bug", "cat-tech"],
          objective_id: "obj-v2",
        },
        CTX,
      ),
    ).toEqual({
      priority: "high",
      effort: "m",
      category_ids: ["cat-bug", "cat-tech"],
      objective_id: "obj-v2",
    });
  });

  it("rend un patch vide quand le modèle n'a rien rendu", () => {
    // Pas de clé, HTTP en échec, JSON de travers : `forcedToolCall` rend `null`,
    // et le ticket doit naître tel qu'il a été écrit.
    expect(sanitizeSmartFill(null, CTX)).toEqual({});
  });

  it("jette une priorité qui n'est pas du vocabulaire", () => {
    expect(sanitizeSmartFill({ priority: "critical" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ priority: 3 }, CTX)).toEqual({});
  });

  it("ne pose pas « none » — c'est le défaut du formulaire, pas un jugement", () => {
    expect(sanitizeSmartFill({ priority: "none" }, CTX)).toEqual({});
  });

  it("garde un effort null : « rien d'estimable » est une vraie réponse", () => {
    expect(sanitizeSmartFill({ effort: null }, CTX)).toEqual({ effort: null });
  });

  it("lit le sentinelle « none » de l'effort comme un null", () => {
    // C'est la valeur que le SCHÉMA offre pour « rien d'estimable » : pas un
    // type union, qui n'est pas accepté partout en appel de fonction strict et
    // dont le refus ne se verrait pas (patch vide, tickets non remplis, silence).
    expect(sanitizeSmartFill({ effort: "none" }, CTX)).toEqual({ effort: null });
  });

  it("jette un effort hors barème", () => {
    expect(sanitizeSmartFill({ effort: "XXL" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ effort: 2 }, CTX)).toEqual({});
  });

  it("ne garde que les catégories qui existent dans CE projet", () => {
    expect(
      sanitizeSmartFill({ category_ids: ["cat-bug", "cat-inventée", 42] }, CTX),
    ).toEqual({ category_ids: ["cat-bug"] });
  });

  it("dédoublonne et borne à trois catégories", () => {
    expect(
      sanitizeSmartFill(
        { category_ids: ["cat-bug", "cat-bug", "cat-feat", "cat-tech", "cat-doc"] },
        CTX,
      ),
    ).toEqual({ category_ids: ["cat-bug", "cat-feat", "cat-tech"] });
  });

  it("ne pose pas de champ catégories quand aucune ne survit", () => {
    // Un `category_ids: []` écrirait « ce ticket n'a délibérément aucune
    // catégorie » là où le modèle n'a fait que se tromper d'ids.
    expect(sanitizeSmartFill({ category_ids: ["inconnue"] }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ category_ids: "Bug" }, CTX)).toEqual({});
  });

  it("refuse un objectif inventé, et n'en pose aucun", () => {
    // Un ticket rangé sous le mauvais objectif coûte plus cher à défaire qu'un
    // ticket sans objectif.
    expect(sanitizeSmartFill({ objective_id: "obj-fantôme" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ objective_id: "Refonte v2" }, CTX)).toEqual({});
  });

  it("avale le « none » d'objectif sans poser le champ", () => {
    // La réponse « aucun objectif ne colle ». Le champ reste absent du patch,
    // donc l'insert ne l'écrit pas — et aucun objectif ne peut porter cet id,
    // ce sont des UUID.
    expect(sanitizeSmartFill({ objective_id: "none" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ objective_id: null }, CTX)).toEqual({});
  });

  it("trie le bon grain de l'ivraie dans une réponse à moitié fausse", () => {
    expect(
      sanitizeSmartFill(
        {
          priority: "urgent",
          effort: "gigantesque",
          category_ids: ["cat-doc", "cat-nope"],
          objective_id: "obj-absent",
        },
        CTX,
      ),
    ).toEqual({ priority: "urgent", category_ids: ["cat-doc"] });
  });
});

describe("buildSmartFillPrompt", () => {
  it("nomme les catégories et les objectifs avec leurs ids", () => {
    const prompt = buildSmartFillPrompt("minddy", CTX);
    expect(prompt).toContain('"Bug" (id: cat-bug)');
    expect(prompt).toContain('"Refonte v2" (id: obj-v2)');
    expect(prompt).toContain("minddy");
  });

  it("dit explicitement quoi répondre quand le projet n'a ni l'un ni l'autre", () => {
    // Un modèle à qui on présente une liste vide invente ; à qui on dit « alors
    // c'est vide », non.
    const prompt = buildSmartFillPrompt("Neuf", { categories: [], objectives: [] });
    expect(prompt).toContain("leave category_ids empty");
    expect(prompt).toContain('objective_id must be "none"');
  });
});
