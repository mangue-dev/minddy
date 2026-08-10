import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-266 — la surface serveur des pages, par-dessus une table en mémoire.
 *
 * On ne moque QUE ce qui sort du process : la table `pages` et le contrôle
 * d'accès au projet. Le vrai `lib/server/pages.ts` tourne au-dessus — c'est lui
 * qu'on veut voir refuser un cycle, corbeiller un sous-arbre entier et le
 * rendre.
 *
 * Ce que ces tests gardent, dans l'ordre de ce qui coûte le plus cher à rater :
 *
 * - le CYCLE. Profondeur illimitée + reparentage libre = une boucle possible,
 *   et toute descente de l'arbre part alors en récursion infinie. 409, et
 *   AUCUNE écriture — pas même les autres champs du même PATCH.
 * - la corbeille RÉCURSIVE. Le geste qui l'appelle le plus souvent est
 *   l'effacement d'un bloc sous-page dans le corps du parent (MIN-272) :
 *   laisser les descendants vivants ferait surgir vingt pages orphelines à la
 *   racine de la sidebar pour une ligne de texte effacée.
 * - la RESTAURATION d'une page dont le parent est resté à la corbeille : elle
 *   remonte à la racine. Sans ça, elle revient invisible — pire que supprimée.
 */

interface Row {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  content: unknown;
  version: number;
  position: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_root_id: string | null;
}

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  /** Projets auxquels l'acteur a accès. Vide = tout est « introuvable ». */
  access: new Set<string>(),
  seq: 0,
}));

/**
 * Faux PostgREST : un tableau en mémoire et les quelques opérateurs que
 * lib/server/pages.ts utilise (eq, is, in, or, order + insert/update/delete).
 * Chaque requête est « thenable » comme celles de postgrest-js, ce qui permet de
 * l'attendre directement ou de la terminer par `single()` / `maybeSingle()`.
 */
vi.mock("@/lib/supabase-service", () => {
  type Filter = (row: Record<string, unknown>) => boolean;

  const from = () => {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> = {};
    let orderColumn: string | null = null;

    const matching = () => h.rows.filter((row) => filters.every((f) => f(row)));

    const run = (): { data: Record<string, unknown>[] | null; error: null } => {
      if (mode === "insert") {
        h.seq += 1;
        const row = {
          id: `page-${h.seq}`,
          parent_id: null,
          title: "",
          icon: null,
          content: { type: "doc", content: [] },
          version: 1,
          created_by: null,
          created_at: `2026-08-10T00:00:0${h.seq}Z`,
          updated_at: `2026-08-10T00:00:0${h.seq}Z`,
          deleted_at: null,
          deleted_by: null,
          deleted_root_id: null,
          ...payload,
        };
        h.rows.push(row);
        return { data: [row], error: null };
      }
      const rows = matching();
      if (mode === "update") {
        for (const row of rows) Object.assign(row, payload);
      }
      if (mode === "delete") {
        h.rows = h.rows.filter((row) => !rows.includes(row));
      }
      if (orderColumn) {
        rows.sort((a, b) =>
          String(a[orderColumn!]) < String(b[orderColumn!]) ? -1 : 1
        );
      }
      return { data: rows, error: null };
    };

    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.insert = (row: Record<string, unknown>) => {
      mode = "insert";
      payload = row;
      return query;
    };
    query.update = (patch: Record<string, unknown>) => {
      mode = "update";
      payload = patch;
      return query;
    };
    query.delete = () => {
      mode = "delete";
      return query;
    };
    query.eq = (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    };
    query.is = (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return query;
    };
    query.not = (column: string, _operator: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) !== value);
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    };
    query.or = (expression: string) => {
      // « id.eq.X,deleted_root_id.eq.X » — la seule forme utilisée.
      const clauses = expression.split(",").map((clause) => clause.split("."));
      filters.push((row) =>
        clauses.some(([column, , value]) => row[column] === value)
      );
      return query;
    };
    query.order = (column: string) => {
      orderColumn = column;
      return query;
    };
    query.limit = () => query;
    query.single = async () => {
      const { data } = run();
      return { data: data?.[0] ?? null, error: data?.length ? null : new Error("no row") };
    };
    query.maybeSingle = async () => {
      const { data } = run();
      return { data: data?.[0] ?? null, error: null };
    };
    query.then = (resolve: (value: unknown) => unknown) => resolve(run());
    return query;
  };

  return { getServiceClient: () => ({ from }) };
});

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async (_userId: string, projectId: string) =>
    h.access.has(projectId) ? { project: { id: projectId }, isOwner: true, isMember: true } : null,
}));

import {
  createPage,
  getPage,
  listPages,
  restorePage,
  trashPage,
  updatePage,
} from "./pages";
import { buildPageTree } from "@/lib/pages";

const ACTOR = "user-1";
const PROJECT = "project-1";

/** Crée une page et rend son id — le chemin normal, jamais un insert à la main. */
async function create(title: string, parentId: string | null = null) {
  const result = await createPage({
    projectId: PROJECT,
    actorId: ACTOR,
    input: { title, parent_id: parentId },
  });
  if (!result.ok) throw new Error(`création refusée : ${result.errorKey}`);
  return result.page.id;
}

const rowOf = (id: string) => h.rows.find((row) => row.id === id) as unknown as Row;

beforeEach(() => {
  h.rows = [];
  h.seq = 0;
  h.access = new Set([PROJECT]);
});

describe("createPage", () => {
  it("crée une page racine, avec une position en fin de fratrie", async () => {
    const first = await create("Guide");
    const second = await create("Onboarding");

    expect(rowOf(second).position > rowOf(first).position).toBe(true);
    expect(rowOf(first).created_by).toBe(ACTOR);
  });

  it("crée une sous-page sous un parent vivant", async () => {
    const parent = await create("Guide");
    const child = await create("Installation", parent);

    expect(rowOf(child).parent_id).toBe(parent);
  });

  it("refuse un parent inconnu ou corbeillé plutôt que de faire une page invisible", async () => {
    const parent = await create("Guide");
    await trashPage(parent, ACTOR);

    const orphan = await createPage({
      projectId: PROJECT,
      actorId: ACTOR,
      input: { title: "Perdue", parent_id: parent },
    });
    expect(orphan).toMatchObject({ ok: false, status: 404, errorKey: "pageParentNotFound" });

    const unknown = await createPage({
      projectId: PROJECT,
      actorId: ACTOR,
      input: { parent_id: "nope" },
    });
    expect(unknown).toMatchObject({ ok: false, errorKey: "pageParentNotFound" });
  });

  it("répond « projet introuvable » à qui n'est pas membre", async () => {
    h.access = new Set();
    const result = await createPage({ projectId: PROJECT, actorId: ACTOR, input: {} });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "projectNotFound" });
  });
});

describe("listPages", () => {
  it("rend les pages vivantes à plat, de quoi rebâtir l'arbre", async () => {
    const parent = await create("Guide");
    await create("Installation", parent);
    await create("Notes");

    const result = await listPages(PROJECT, ACTOR);
    if (!result.ok) throw new Error("liste refusée");

    expect(result.pages).toHaveLength(3);
    const tree = buildPageTree(result.pages.map((p) => ({ ...p, content: null })));
    expect(tree).toHaveLength(2);
    expect(tree.find((n) => n.id === parent)?.children).toHaveLength(1);
  });

  it("n'inclut pas les pages corbeillées", async () => {
    const kept = await create("Guide");
    const gone = await create("Brouillon");
    await trashPage(gone, ACTOR);

    const result = await listPages(PROJECT, ACTOR);
    if (!result.ok) throw new Error("liste refusée");
    expect(result.pages.map((p) => p.id)).toEqual([kept]);
  });
});

describe("updatePage", () => {
  it("écrit le titre, l'icône et le corps, et incrémente la version du corps", async () => {
    const id = await create("Guide");

    const result = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { title: "Guide d'équipe", icon: "📘", content: { type: "doc", content: [] } },
    });
    if (!result.ok) throw new Error("écriture refusée");

    expect(result.page).toMatchObject({ title: "Guide d'équipe", icon: "📘", version: 2 });

    // Un renommage seul ne compte pas comme une écriture du corps.
    const renamed = await updatePage({ pageId: id, actorId: ACTOR, input: { title: "Guide" } });
    if (!renamed.ok) throw new Error("écriture refusée");
    expect(renamed.page.version).toBe(2);
  });

  it("REFUSE de mettre une page sous un de ses descendants, sans rien écrire", async () => {
    // A → B → C : reparenter A sous C fermerait la boucle.
    const a = await create("A");
    const b = await create("B", a);
    const c = await create("C", b);

    const result = await updatePage({
      pageId: a,
      actorId: ACTOR,
      input: { parent_id: c, title: "Renommée au passage" },
    });

    expect(result).toMatchObject({ ok: false, status: 409, errorKey: "pageCycle" });
    // Le refus est TOTAL : le titre de la même requête n'est pas passé non plus.
    expect(rowOf(a)).toMatchObject({ parent_id: null, title: "A" });
    expect(rowOf(c).parent_id).toBe(b);
  });

  it("refuse aussi qu'une page devienne son propre parent", async () => {
    const id = await create("A");
    const result = await updatePage({ pageId: id, actorId: ACTOR, input: { parent_id: id } });
    expect(result).toMatchObject({ ok: false, status: 409, errorKey: "pageCycle" });
  });

  it("accepte un déplacement légitime et replace la page en fin de sa nouvelle fratrie", async () => {
    const a = await create("A");
    const b = await create("B", a);
    const sibling = await create("Voisine", a);

    const result = await updatePage({ pageId: b, actorId: ACTOR, input: { parent_id: null } });
    if (!result.ok) throw new Error(`déplacement refusé : ${result.errorKey}`);

    expect(result.page.parent_id).toBeNull();
    // En fin de la fratrie RACINE, donc après A — et non à la place qu'elle
    // occupait sous A, qui n'a plus de sens ici.
    expect(result.page.position > rowOf(a).position).toBe(true);
    expect(rowOf(sibling).parent_id).toBe(a);
  });

  it("refuse une requête qui ne demande rien", async () => {
    const id = await create("A");
    const result = await updatePage({ pageId: id, actorId: ACTOR, input: {} });
    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "noFieldsToUpdate" });
  });

  it("ignore une position hors alphabet plutôt que de la ranger n'importe où", async () => {
    const id = await create("A");
    const before = rowOf(id).position;
    const result = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { position: "pas une clé !", title: "A" },
    });
    if (!result.ok) throw new Error("écriture refusée");
    expect(result.page.position).toBe(before);
  });
});

describe("trashPage", () => {
  it("emporte toute la descendance, et ne garde qu'UNE racine de suppression", async () => {
    const a = await create("A");
    const b = await create("B", a);
    const c = await create("C", b);
    const elsewhere = await create("Ailleurs");

    const result = await trashPage(a, ACTOR);
    expect(result).toMatchObject({ ok: true, trashed: 3 });

    expect(rowOf(a)).toMatchObject({ deleted_by: ACTOR, deleted_root_id: null });
    expect(rowOf(a).deleted_at).toBeTruthy();
    // Les descendants pointent la racine : la corbeille n'affiche qu'une ligne.
    expect(rowOf(b).deleted_root_id).toBe(a);
    expect(rowOf(c).deleted_root_id).toBe(a);
    expect(rowOf(elsewhere).deleted_at).toBeNull();
  });

  it("ne retouche pas une sous-page déjà corbeillée pour elle-même", async () => {
    const a = await create("A");
    const b = await create("B", a);
    await trashPage(b, ACTOR);

    await trashPage(a, ACTOR);

    // B garde SA racine (null) : restaurer A ne le ramène pas, personne ne l'a
    // demandé — il est restaurable pour lui-même.
    expect(rowOf(b).deleted_root_id).toBeNull();
  });

  it("répond 404 sur une page déjà corbeillée ou inconnue", async () => {
    const id = await create("A");
    await trashPage(id, ACTOR);
    expect(await trashPage(id, ACTOR)).toMatchObject({ ok: false, status: 404 });
    expect(await trashPage("nope", ACTOR)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("restorePage", () => {
  it("rend la page et tout ce qui est parti avec elle", async () => {
    const a = await create("A");
    const b = await create("B", a);
    const c = await create("C", b);
    await trashPage(a, ACTOR);

    expect(await restorePage(a, ACTOR)).toMatchObject({ ok: true, restored: 3 });

    for (const id of [a, b, c]) {
      expect(rowOf(id)).toMatchObject({
        deleted_at: null,
        deleted_by: null,
        deleted_root_id: null,
      });
    }
    // L'arbre est retrouvé tel quel : rien n'a été détaché.
    expect(rowOf(b).parent_id).toBe(a);
    expect(rowOf(c).parent_id).toBe(b);
  });

  it("remonte à la racine une page dont le parent est resté à la corbeille", async () => {
    const parent = await create("Parent");
    const child = await create("Enfant", parent);

    // On corbeille l'enfant seul, puis le parent : deux suppressions distinctes.
    await trashPage(child, ACTOR);
    await trashPage(parent, ACTOR);

    expect(await restorePage(child, ACTOR)).toMatchObject({ ok: true, restored: 1 });

    // Revenir sous un parent invisible ferait une page introuvable dans la
    // sidebar : mal placée vaut mieux qu'absente.
    expect(rowOf(child).parent_id).toBeNull();
    expect(rowOf(parent).deleted_at).toBeTruthy();
  });

  it("répond 404 sur une page vivante, inconnue, ou hors des projets de l'acteur", async () => {
    const id = await create("A");
    expect(await restorePage(id, ACTOR)).toMatchObject({ ok: false, status: 404 });

    await trashPage(id, ACTOR);
    h.access = new Set();
    expect(await restorePage(id, ACTOR)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("getPage", () => {
  it("rend la page avec son corps, et la masque à qui n'a pas le projet", async () => {
    const id = await create("A");
    expect(await getPage(id, ACTOR)).toMatchObject({ ok: true });

    h.access = new Set();
    expect(await getPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
  });
});
