import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resolveCategoryIdsByName` — la passe qui transforme des NOMS d'étiquettes en
 * catégories du projet, partagée par l'import en masse et par la synchro d'un
 * dépôt lié.
 *
 * Ce qui se teste ici n'est pas « est-ce que ça crée une catégorie » — ça, ça se
 * voit. C'est l'ACCORD entre les deux moitiés de la fonction : le nom qu'elle
 * ÉCRIT en base et la clé sous laquelle elle l'INDEXE. Les deux passent par la
 * même troncature à 200 caractères, et le jour où elles ont divergé, rien n'a
 * levé : la catégorie était créée, jamais rattachée, et une NOUVELLE repartait
 * au passage suivant — à chaque webhook, `categories` n'ayant aucune unicité sur
 * `(project_id, name)`. Une fuite lente que personne ne regarde.
 *
 * Le double PostgREST applique le filtre `project_id` pour de vrai : sans ça, le
 * test ne dirait rien de la requête qu'on écrit.
 */

interface Row extends Record<string, unknown> {
  id: string;
}

let categoryRows: Row[] = [];
/** Forcer l'échec de la prochaine écriture, pour la branche « la base refuse ». */
let failInsert = false;
/** Combien de SELECT ont eu lieu — une liste vide ne doit en faire aucun. */
let selects = 0;

let nextId = 0;
const newId = () => `cat-${++nextId}`;

/** Double de chaîne PostgREST, réduit à ce que `categories` touche : un select
    filtré, un insert qui rend les lignes écrites (`.select()` en retour). */
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

/** Une catégorie déjà en base, comme la migration l'écrirait. */
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
  // 250 caractères : hors de portée de GitHub (50) et d'un CSV parsé (60),
  // atteignable par un titre de label GitLab (255).
  const LONG = "a".repeat(250);

  it("écrit le nom TRONQUÉ mais l'indexe sous la clé du nom entier", async () => {
    const resolved = await resolveCategoryIdsByName(PROJECT, [LONG]);

    expect(categoryRows[0].name).toBe("a".repeat(200));
    // Le point de tout : l'appelant cherche avec le label BRUT.
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
    // MIN-118 a posé la troncature ; les lignes d'avant peuvent dépasser.
    const legacy = seed(LONG);
    const resolved = await resolveCategoryIdsByName(PROJECT, [LONG]);

    expect(resolved!.created).toBe(0);
    expect(resolved!.idByKey.get(categoryKey(LONG))).toBe(legacy.id);
  });
});
