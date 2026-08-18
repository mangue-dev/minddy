import { describe, expect, it } from "vitest";

import { pageBacklinks, type BacklinkQueryable } from "./page-backlinks";

/**
 * MIN-279 — READ trackbacks, over four tables in memory.
 *
 * `page-links.test.ts` covers derivation; here it is the other half, that
 * which combines the two origins into a list. Three rules hold everything there, and
 * none are seen in the return type:
 *
 * - a source which cites the page in BOTH ways (a resource pill AND
 * a mention in its text) is ONE line, dated the first of the two
 * gestures — attach the resource of a ticket which already mentioned the page ne
 * should not bring it to the top as something new;
 * - a source that can no longer be named — trashed, or purged leaving its
 * line behind it, `source_id` not carrying a foreign key — exits as
 * silence ;
 * - order is gender first (ticket, goal, page), date second.
 *
 * The client is described by hand: `pageBacklinks` only requests four single-filter
 * `select`, that's exactly what the false table render.
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
      // `gone` no longer has a line: the source has been purged, the trackback has
      // survived, and this is where it ceases to exist.
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
    // for a ticket, its color for a goal, its emoji for a page.
    expect(found[1].identifier).toBe("MIN-1");
    expect(found[2]).toMatchObject({ title: "L'objectif", color: "amber" });
    expect(found[3]).toMatchObject({ title: "L'autre page", icon: "📘" });
  });

  it("ne dit rien quand personne ne cite la page", async () => {
    expect(await read({})).toEqual([]);
  });
});
