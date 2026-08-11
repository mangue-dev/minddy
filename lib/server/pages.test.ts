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
  parent_block_removed: boolean;
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
    let payload: Record<string, unknown> | Record<string, unknown>[] = {};
    let orderColumn: string | null = null;

    const matching = () => h.rows.filter((row) => filters.every((f) => f(row)));

    const run = (): { data: Record<string, unknown>[] | null; error: null } => {
      if (mode === "insert") {
        // Un objet OU un tableau : la duplication écrit toute une branche d'un
        // coup (MIN-272), et une copie à moitié posée serait un arbre faux.
        const inserted = (Array.isArray(payload) ? payload : [payload]).map(
          (values) => {
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
              parent_block_removed: false,
              ...values,
            };
            h.rows.push(row);
            return row;
          }
        );
        return { data: inserted, error: null };
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
    query.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => {
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
  duplicatePage,
  getPage,
  listPages,
  discardPage,
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

describe("discardPage", () => {
  it("DÉTRUIT une page restée vide, sans passer par la corbeille", async () => {
    const id = await create("");

    expect(await discardPage(id, ACTOR)).toEqual({ ok: true });
    // Pas de ligne marquée : la ligne n'existe plus. C'est tout l'intérêt —
    // une page qu'on a créée puis quittée sans y écrire n'a pas à venir
    // encombrer la corbeille.
    expect(h.rows.find((row) => row.id === id)).toBeUndefined();
  });

  it("refuse une page qui porte un titre", async () => {
    const id = await create("Cadrage");
    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 409,
      errorKey: "pageNotEmpty",
    });
    expect(rowOf(id).deleted_at).toBeNull();
  });

  it("refuse une page qui porte du texte", async () => {
    const id = await create("");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Un mot" }] },
          ],
        },
      },
    });

    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      errorKey: "pageNotEmpty",
    });
    expect(rowOf(id)).toBeDefined();
  });

  it("refuse une page vide qui porte une sous-page", async () => {
    const parent = await create("");
    const child = await create("Dedans", parent);

    expect(await discardPage(parent, ACTOR)).toMatchObject({
      ok: false,
      errorKey: "pageNotEmpty",
    });
    expect(rowOf(parent)).toBeDefined();
    expect(rowOf(child)).toBeDefined();
  });

  it("laisse passer le paragraphe vide d'une page neuve", async () => {
    const id = await create("");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: { type: "doc", content: [{ type: "paragraph" }] } },
    });

    expect(await discardPage(id, ACTOR)).toEqual({ ok: true });
  });

  it("emporte le bloc sous-page du corps du parent", async () => {
    const parent = await create("Parent");
    const child = await create("", parent);
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [{ type: "subpage", attrs: { pageId: child } }],
        },
      },
    });

    expect(await discardPage(child, ACTOR)).toEqual({ ok: true });
    // Un bloc qui cite une ligne détruite est un lien mort dans le document du
    // parent : il part avec elle, comme à la corbeille (MIN-272).
    expect(JSON.stringify(rowOf(parent).content)).not.toContain(child);
  });

  it("répond 404 hors du projet, et ne détruit rien", async () => {
    const id = await create("");
    h.access = new Set();
    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(h.rows.find((row) => row.id === id)).toBeDefined();
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

/**
 * MIN-272 — le MIROIR : le bloc `subpage` dans le corps du parent.
 *
 * La même information est portée à deux endroits, et c'est là que sont tous les
 * pièges. `parent_id` fait la vérité, le bloc n'en est qu'une vue — et c'est le
 * serveur qui tient la vue à jour, parce que le geste part le plus souvent de la
 * sidebar, sans que personne n'ait le parent ouvert.
 *
 * Le pendant côté document (détection de la suppression du bloc dans l'éditeur,
 * fonctions pures) est dans lib/pages-subpage.test.ts.
 */
describe("le bloc sous-page dans le corps du parent (MIN-272)", () => {
  /** Un corps qui cite `pageId`, entouré d'un peu de texte. */
  const bodyCiting = (pageId: string) => ({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "avant" }] },
      { type: "subpage", attrs: { pageId } },
      { type: "paragraph", content: [{ type: "text", text: "après" }] },
    ],
  });

  const bodyOf = (id: string) =>
    rowOf(id).content as { content: { type: string; attrs?: { pageId?: string } }[] };

  it("retire le bloc du corps du parent quand la page part à la corbeille", async () => {
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: { content: bodyCiting(child) },
    });
    const before = rowOf(parent).version;

    await trashPage(child, ACTOR);

    expect(bodyOf(parent).content.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    // La version BOUGE : c'est elle qui envoie en fusion (MIN-271) le client
    // qui aurait ce parent ouvert, et sa suppression y passe sans bruit.
    expect(rowOf(parent).version).toBe(before + 1);
    expect(rowOf(child).parent_block_removed).toBe(true);
  });

  it("remet le bloc en fin de corps à la restauration", async () => {
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: { content: bodyCiting(child) },
    });

    await trashPage(child, ACTOR);
    await restorePage(child, ACTOR);

    const nodes = bodyOf(parent).content;
    expect(nodes.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "subpage",
    ]);
    expect(nodes[2].attrs?.pageId).toBe(child);
    // La marque ne survit pas : c'est le prochain passage à la corbeille qui
    // dira ce qu'il en est alors.
    expect(rowOf(child).parent_block_removed).toBe(false);
  });

  it("n'INVENTE pas de bloc pour une page née dans la sidebar", async () => {
    // Le piège du sens inverse : une page créée depuis l'arbre n'a jamais eu de
    // bloc chez son parent. La restaurer ne doit pas en faire apparaître un
    // dans un document que personne n'a écrit comme ça.
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "seul" }] }],
        },
      },
    });
    const version = rowOf(parent).version;

    await trashPage(child, ACTOR);
    await restorePage(child, ACTOR);

    expect(bodyOf(parent).content.map((node) => node.type)).toEqual(["paragraph"]);
    expect(rowOf(parent).version).toBe(version);
  });

  it("ne touche qu'au corps de la RACINE du geste, pas à ceux des descendants", async () => {
    // Les blocs des descendants vivent dans des corps qui partent à la
    // corbeille en même temps : les réécrire serait du travail pour rien, et
    // ferait revenir des pages amputées de leurs liens à la restauration.
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    const grand = await create("Section", child);
    await updatePage({
      pageId: child,
      actorId: ACTOR,
      input: { content: bodyCiting(grand) },
    });
    const version = rowOf(child).version;

    await trashPage(child, ACTOR);

    expect(bodyOf(child).content.map((node) => node.type)).toContain("subpage");
    expect(rowOf(child).version).toBe(version);
  });

  it("ne remet rien en double quand le bloc a été recréé entre-temps", async () => {
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: { content: bodyCiting(child) },
    });

    await trashPage(child, ACTOR);
    // Quelqu'un repose un bloc vers la même page avant qu'on restaure.
    await updatePage({
      pageId: parent,
      actorId: ACTOR,
      input: { content: bodyCiting(child) },
    });
    await restorePage(child, ACTOR);

    const subpages = bodyOf(parent).content.filter((node) => node.type === "subpage");
    expect(subpages).toHaveLength(1);
  });

  it("laisse la page partir à la corbeille même si le corps du parent est illisible", async () => {
    // Le miroir est un confort, pas une condition : refuser la suppression
    // parce que la vue n'a pas suivi serait le mauvais échange.
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    rowOf(parent).content = null as unknown as Row["content"];

    const result = await trashPage(child, ACTOR);

    expect(result).toMatchObject({ ok: true, trashed: 1 });
    expect(rowOf(child).deleted_at).not.toBeNull();
  });
});

/**
 * MIN-272 — la DUPLICATION d'une page.
 *
 * Ce qui coûte cher à rater tient en une phrase : une copie dont les blocs
 * pointent encore vers les ORIGINAUX. On aurait deux arbres dans la sidebar et
 * un seul jeu de liens — une copie qu'on croit indépendante et qui renvoie
 * ailleurs, ce qu'on ne découvre qu'en cliquant.
 */
describe("duplicatePage (MIN-272)", () => {
  const bodyCiting = (...pageIds: string[]) => ({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "corps" }] },
      ...pageIds.map((pageId) => ({ type: "subpage", attrs: { pageId } })),
    ],
  });

  const citedBy = (id: string) =>
    ((rowOf(id).content as { content: { type: string; attrs?: { pageId?: string } }[] })
      .content.filter((node) => node.type === "subpage")
      .map((node) => node.attrs?.pageId ?? null));

  it("copie la page ET sa descendance, sous le même parent", async () => {
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await create("Section", child);

    const result = await duplicatePage(root, ACTOR);
    if (!result.ok) throw new Error(result.errorKey);

    expect(result.page.id).not.toBe(root);
    expect(result.page.title).toBe("Guide");
    expect(result.page.parent_id).toBeNull();
    // Trois pages copiées, donc six en tout.
    expect(h.rows).toHaveLength(6);
    // La racine de la copie passe APRÈS l'originale dans sa fratrie.
    expect(result.page.position > rowOf(root).position).toBe(true);
  });

  it("réécrit les liens INTERNES vers la copie, jamais vers l'original", async () => {
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await updatePage({
      pageId: root,
      actorId: ACTOR,
      input: { content: bodyCiting(child) },
    });

    const result = await duplicatePage(root, ACTOR);
    if (!result.ok) throw new Error(result.errorKey);

    const [cited] = citedBy(result.page.id);
    expect(cited).not.toBe(child);
    // Et ce qu'il cite est bien LA copie de l'enfant : même titre, parent copié.
    expect(rowOf(cited!).title).toBe("Chapitre");
    expect(rowOf(cited!).parent_id).toBe(result.page.id);
    // L'original n'a pas bougé d'un cheveu.
    expect(citedBy(root)).toEqual([child]);
  });

  it("laisse INTACT un lien qui sort de la branche copiée", async () => {
    // Une page du projet qui n'est pas dans la copie doit continuer d'être
    // citée telle quelle : on copie une branche, pas le monde autour.
    const ailleurs = await create("Ailleurs");
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await updatePage({
      pageId: root,
      actorId: ACTOR,
      input: { content: bodyCiting(child, ailleurs) },
    });

    const result = await duplicatePage(root, ACTOR);
    if (!result.ok) throw new Error(result.errorKey);

    const cited = citedBy(result.page.id);
    expect(cited[0]).not.toBe(child);
    expect(cited[1]).toBe(ailleurs);
  });

  it("n'emporte pas les sous-pages déjà à la corbeille", async () => {
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await trashPage(child, ACTOR);

    const result = await duplicatePage(root, ACTOR);
    if (!result.ok) throw new Error(result.errorKey);

    const copies = h.rows.filter(
      (row) => (row as unknown as Row).parent_id === result.page.id
    );
    expect(copies).toHaveLength(0);
  });

  it("répond 404 sur une page corbeillée, inconnue, ou hors des projets de l'acteur", async () => {
    const root = await create("Guide");
    await trashPage(root, ACTOR);
    expect(await duplicatePage(root, ACTOR)).toMatchObject({ ok: false, status: 404 });

    const other = await create("Autre");
    h.access = new Set();
    expect(await duplicatePage(other, ACTOR)).toMatchObject({ ok: false, status: 404 });
  });
});
