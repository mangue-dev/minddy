import { describe, expect, it } from "vitest";

import {
  buildSmartFillPrompt,
  sanitizeSmartFill,
  type SmartFillContext,
} from "./smart-fill";

/**
 * THE WHITELIST, trained on what a small model really renders.
 *
 * Smart-fill written in a ticket without anyone proofreading: everything it
 * posts has gone through `sanitizeSmartFill`, and so this is the only place du
 * path where a crooked response can be stopped. The cases below are
 * those that we see in real life — an invented id, a similar but false enum, a ticket
 * arranged in eight categories, a `null` which means something.
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
    // No key, HTTP failed, JSON wrong: `forcedToolCall` returns `null`,
    // and the ticket must be born as it was written.
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
    // This is the value that the SCHEMA offers for “nothing valuable”: not one
    // union type, which is not accepted everywhere in strict function calls and
    // whose refusal would not be seen (empty patch, unfilled tickets, silence).
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
    // A `category_ids: []` would write "this ticket deliberately has no
    // category » where the model only got the ids wrong.
    expect(sanitizeSmartFill({ category_ids: ["inconnue"] }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ category_ids: "Bug" }, CTX)).toEqual({});
  });

  it("refuse un objectif inventé, et n'en pose aucun", () => {
    // A ticket stored under the wrong objective costs more to undo than one
    // ticket sans objectif.
    expect(sanitizeSmartFill({ objective_id: "obj-fantôme" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ objective_id: "Refonte v2" }, CTX)).toEqual({});
  });

  it("avale le « none » d'objectif sans poser le champ", () => {
    // The answer “no objective fits”. The field remains missing from the patch,
    // so the insert doesn't write it — and no lens can carry this id,
    // these are UUIDs.
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
    // A model who is presented with an empty list invents; to whom we say “so
    // it’s empty”, no.
    const prompt = buildSmartFillPrompt("Neuf", { categories: [], objectives: [] });
    expect(prompt).toContain("leave category_ids empty");
    expect(prompt).toContain('objective_id must be "none"');
  });
});
