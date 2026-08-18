import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resolveCategoryIdsByName` — the pass that transforms label NAMES into
 * categories of the project, shared by the mass import and by the synchronization of a
 * linked deposit.
 *
 * What is being tested here is not “does this create a category” — that is
 * see. It is the AGREEMENT between the two halves of the function: the name it
 * WRITTEN in base and the key under which it INDEXES it. Both pass through
 * same truncation at 200 characters, and the day they diverged, nothing
 * lifted: the category was created, never attached, and a NEW one started again
 * in the next pass — at each webhook, `categories` having no uniqueness on
 * `(project_id, name)`. A slow leak that no one watches.
 *
 * The double PostgREST applies the `project_id` filter for real: without that, the
 * test would say nothing about the query we write.
 */

interface Row extends Record<string, unknown> {
  id: string;
}

let categoryRows: Row[] = [];
/** Force the next write to fail, for the “base refuses” branch. */
let failInsert = false;
/** How many SELECTs occurred — an empty list should do none. */
let selects = 0;

let nextId = 0;
const newId = () => `cat-${++nextId}`;

/** Double PostgREST string, reduced to what `categories` touches: a select
    filtered, an insert which makes the lines written (`.select()` in return). */
function table() {
  const filters: ((row: Row) => boolean)[] = [];
  let staged: Record<string, unknown>[] | null = null;
  const query: Record<string, unknown> = {};

  query.select = () => query;
  query.insert = (payload: Record<string, unknown>[]) => {
    staged = payload;
    return query;
  };
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };

  const resolve = () => {
    if (staged) {
      if (failInsert) {
        return { data: null, error: { message: "insert refused" } };
      }
      const written = staged.map((payload) => ({ id: newId(), ...payload }) as Row);
      categoryRows.push(...written);
      return { data: written, error: null };
    }
    selects += 1;
    return { data: categoryRows.filter((row) => filters.every((f) => f(row))), error: null };
  };

  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => table() }),
}));

const { categoryKey, resolveCategoryIdsByName } = await import("@/lib/server/categories");
const { CATEGORY_COLORS } = await import("@/lib/category-colors");

const PROJECT = "project-1";

/** A category already in base, as migration would write it. */
function seed(name: string, projectId = PROJECT): Row {
  const row: Row = { id: newId(), project_id: projectId, name, color: "#6b7280" };
  categoryRows.push(row);
  return row;
}

beforeEach(() => {
  categoryRows = [];
  failInsert = false;
  selects = 0;
  nextId = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveCategoryIdsByName — rapprochement", () => {
  it("retrouve une catégorie existante à la casse près, sans rien créer", async () => {
    const bug = seed("Bug");
    const resolved = await resolveCategoryIdsByName(PROJECT, ["bug", "BUG"]);

    expect(resolved).not.toBeNull();
    expect(resolved!.created).toBe(0);
    expect(resolved!.idByKey.get(categoryKey("bug"))).toBe(bug.id);
    expect(categoryRows).toHaveLength(1);
  });

  it("ignore les catégories d'un AUTRE projet", async () => {
    seed("Bug", "project-2");
    const resolved = await resolveCategoryIdsByName(PROJECT, ["Bug"]);

    expect(resolved!.created).toBe(1);
    expect(categoryRows.filter((r) => r.project_id === PROJECT)).toHaveLength(1);
  });

  it("crée ce qui manque et poursuit la palette là où le projet s'est arrêté", async () => {
    seed("Bug");
    seed("Doc");
    const resolved = await resolveCategoryIdsByName(PROJECT, ["Bug", "Perf"]);

    expect(resolved!.created).toBe(1);
    const perf = categoryRows.find((r) => r.name === "Perf");
    expect(perf?.color).toBe(CATEGORY_COLORS[2 % CATEGORY_COLORS.length]);
    expect(resolved!.idByKey.get(categoryKey("Perf"))).toBe(perf?.id);
  });

  it("garde la PREMIÈRE casse vue quand le lot répète un nom", async () => {
    await resolveCategoryIdsByName(PROJECT, ["Perf", "perf", "PERF"]);

    expect(categoryRows).toHaveLength(1);
    expect(categoryRows[0].name).toBe("Perf");
  });

  it("rogne les noms et laisse tomber les blancs", async () => {
    const resolved = await resolveCategoryIdsByName(PROJECT, ["  Bug  ", "   ", ""]);

    expect(categoryRows).toHaveLength(1);
    expect(categoryRows[0].name).toBe("Bug");
    expect(resolved!.idByKey.get(categoryKey("Bug"))).toBe(categoryRows[0].id);
  });

  it("ne touche pas la base pour une liste sans aucun nom lisible", async () => {
    const resolved = await resolveCategoryIdsByName(PROJECT, ["", "  "]);

    expect(resolved).toEqual({ idByKey: new Map(), created: 0 });
    expect(selects).toBe(0);
  });

  it("rend null quand la base refuse — l'appelant décide, il ne devine pas", async () => {
    failInsert = true;
    expect(await resolveCategoryIdsByName(PROJECT, ["Perf"])).toBeNull();
  });
});

describe("resolveCategoryIdsByName — un nom plus long que la borne", () => {
  // 250 characters: beyond the reach of GitHub (50) and a parsed CSV (60),
  // atteignable par un titre de label GitLab (255).
  const LONG = "a".repeat(250);

  it("écrit le nom TRONQUÉ mais l'indexe sous la clé du nom entier", async () => {
    const resolved = await resolveCategoryIdsByName(PROJECT, [LONG]);

    expect(categoryRows[0].name).toBe("a".repeat(200));
    // The point of everything: the caller is looking with the BRUT label.
    expect(resolved!.idByKey.get(categoryKey(LONG))).toBe(categoryRows[0].id);
  });

  it("n'en crée pas une deuxième au passage suivant", async () => {
    const first = await resolveCategoryIdsByName(PROJECT, [LONG]);
    const second = await resolveCategoryIdsByName(PROJECT, [LONG]);

    expect(second!.created).toBe(0);
    expect(categoryRows).toHaveLength(1);
    expect(second!.idByKey.get(categoryKey(LONG))).toBe(
      first!.idByKey.get(categoryKey(LONG)),
    );
  });

  it("retrouve une ligne écrite AVANT la borne, sans lui fabriquer un doublon coupé", async () => {
    // MIN-118 posed the truncation; the front lines may protrude.
    const legacy = seed(LONG);
    const resolved = await resolveCategoryIdsByName(PROJECT, [LONG]);

    expect(resolved!.created).toBe(0);
    expect(resolved!.idByKey.get(categoryKey(LONG))).toBe(legacy.id);
  });
});
