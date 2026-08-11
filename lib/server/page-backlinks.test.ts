import { describe, expect, it } from "vitest";

import { pageBacklinks, type BacklinkQueryable } from "./page-backlinks";

/**
 * MIN-279 — la LECTURE des rétroliens, par-dessus quatre tables en mémoire.
 *
 * `page-links.test.ts` couvre la dérivation ; ici c'est l'autre moitié, celle
 * qui fond les deux origines en une liste. Trois règles y tiennent tout, et
 * aucune ne se voit dans le type de retour :
 *
 *  - une source qui cite la page des DEUX façons (une pilule de ressource ET
 *    une mention dans son texte) est UNE ligne, datée du premier des deux
 *    gestes — attacher la ressource d'un ticket qui mentionnait déjà la page ne
 *    doit pas la faire remonter en tête comme une nouveauté ;
 *  - une source qu'on ne peut plus nommer — corbeillée, ou purgée en laissant sa
 *    ligne derrière elle, `source_id` ne portant pas de clé étrangère — sort en
 *    silence ;
 *  - l'ordre est le genre d'abord (ticket, objectif, page), la date ensuite.
 *
 * Le client est décrit à la main : `pageBacklinks` ne demande que quatre
 * `select` à filtre unique, c'est exactement ce que la fausse table rend.
 */

interface Tables {
  page_links: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  issues: Record<string, unknown>[];
  objectives: Record<string, unknown>[];
  pages: Record<string, unknown>[];
}

function queryable(tables: Partial<Tables>): BacklinkQueryable {
  return {
    from: (table: string) => {
      const rows = (tables as Record<string, Record<string, unknown>[]>)[table] ?? [];
      return {
        select: () => ({
          eq: (column: string, value: unknown) =>
            Promise.resolve({
              data: rows.filter((row) => row[column] === value),
              error: null,
            }),
          in: (column: string, values: unknown[]) =>
            Promise.resolve({
              data: rows.filter((row) => values.includes(row[column])),
              error: null,
            }),
        }),
      };
    },
  };
}

const read = (tables: Partial<Tables>) =>
  pageBacklinks(queryable(tables), { pageId: "spec", projectKey: "MIN" });

describe("pageBacklinks", () => {
  it("fond les deux origines d'une même source en une ligne, à la date la plus ancienne", async () => {
    const found = await read({
      page_links: [
        {
          page_id: "spec",
          source_kind: "issue",
          source_id: "i1",
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
      attachments: [
        { page_id: "spec", issue_id: "i1", created_at: "2026-08-09T00:00:00Z" },
      ],
      issues: [{ id: "i1", number: 42, title: "Le ticket", deleted_at: null }],
    });

    expect(found).toEqual([
      {
        kind: "issue",
        id: "i1",
        identifier: "MIN-42",
        title: "Le ticket",
        icon: null,
        color: null,
        at: "2026-08-01T00:00:00Z",
      },
    ]);
  });

  it("laisse tomber ce qu'elle ne peut plus nommer : corbeillé ou purgé", async () => {
    const found = await read({
      page_links: [
        {
          page_id: "spec",
          source_kind: "issue",
          source_id: "trashed",
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          page_id: "spec",
          source_kind: "objective",
          source_id: "gone",
          created_at: "2026-08-02T00:00:00Z",
        },
      ],
      issues: [
        {
          id: "trashed",
          number: 7,
          title: "À la poubelle",
          deleted_at: "2026-08-03T00:00:00Z",
        },
      ],
      // `gone` n'a plus de ligne : la source a été purgée, le rétrolien a
      // survécu, et c'est ici qu'il cesse d'exister.
      objectives: [],
    });

    expect(found).toEqual([]);
  });

  it("ordonne par genre puis par date, la plus récente d'abord", async () => {
    const at = (day: string) => `2026-08-${day}T00:00:00Z`;
    const found = await read({
      page_links: [
        { page_id: "spec", source_kind: "page", source_id: "pg", created_at: at("01") },
        { page_id: "spec", source_kind: "issue", source_id: "i1", created_at: at("02") },
        { page_id: "spec", source_kind: "objective", source_id: "o1", created_at: at("03") },
        { page_id: "spec", source_kind: "issue", source_id: "i2", created_at: at("04") },
      ],
      issues: [
        { id: "i1", number: 1, title: "Un", deleted_at: null },
        { id: "i2", number: 2, title: "Deux", deleted_at: null },
      ],
      objectives: [{ id: "o1", name: "L'objectif", color: "amber", deleted_at: null }],
      pages: [{ id: "pg", title: "L'autre page", icon: "📘", deleted_at: null }],
    });

    expect(found.map((row) => row.id)).toEqual(["i2", "i1", "o1", "pg"]);
    // Chaque genre se nomme comme il se nomme partout ailleurs : un identifiant
    // pour un ticket, sa couleur pour un objectif, son émoji pour une page.
    expect(found[1].identifier).toBe("MIN-1");
    expect(found[2]).toMatchObject({ title: "L'objectif", color: "amber" });
    expect(found[3]).toMatchObject({ title: "L'autre page", icon: "📘" });
  });

  it("ne dit rien quand personne ne cite la page", async () => {
    expect(await read({})).toEqual([]);
  });
});
