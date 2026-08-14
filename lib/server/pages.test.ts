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
  updated_by: string | null;
  updated_kind: "human" | "agent";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_root_id: string | null;
}

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  /** L'HISTORIQUE (MIN-277) — `page_versions`, la seconde table du module. */
  versions: [] as Record<string, unknown>[],
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

  // Deux tables, et il en faut bien deux : une ligne d'historique porte un
  // `project_id` et pas de `deleted_at`, donc mêlée aux pages elle sortirait
  // dans la liste de la sidebar — un faux positif qui ferait douter des tests
  // plutôt que du code.
  const from = (table: string) => {
    const pages = table === "pages";
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> | Record<string, unknown>[] = {};
    let orderColumn: string | null = null;
    let ascending = true;

    const all = () => (pages ? h.rows : h.versions);
    const matching = () => all().filter((row) => filters.every((f) => f(row)));

    const run = (): { data: Record<string, unknown>[] | null; error: null } => {
      if (mode === "insert") {
        // Un objet OU un tableau : la duplication écrit toute une branche d'un
        // coup (MIN-272), et une copie à moitié posée serait un arbre faux.
        const inserted = (Array.isArray(payload) ? payload : [payload]).map(
          (values) => {
            h.seq += 1;
            const row = pages
              ? {
                  id: `page-${h.seq}`,
                  parent_id: null,
                  title: "",
                  icon: null,
                  content: { type: "doc", content: [] },
                  version: 1,
                  created_by: null,
                  updated_by: null,
                  updated_kind: "human",
                  created_at: `2026-08-10T00:00:0${h.seq}Z`,
                  updated_at: `2026-08-10T00:00:0${h.seq}Z`,
                  deleted_at: null,
                  deleted_by: null,
                  deleted_root_id: null,
                  parent_block_removed: false,
                  ...values,
                }
              : {
                  id: `version-${h.seq}`,
                  // Le vrai `default now()` : la coalescence lit cette colonne,
                  // et un horodatage figé ferait passer le test pour vrai.
                  created_at: new Date().toISOString(),
                  ...values,
                };
            all().push(row);
            return row;
          }
        );
        return { data: inserted.map((row) => ({ ...row })), error: null };
      }
      const rows = matching();
      if (mode === "update") {
        for (const row of rows) Object.assign(row, payload);
      }
      if (mode === "delete") {
        if (pages) h.rows = h.rows.filter((row) => !rows.includes(row));
        else h.versions = h.versions.filter((row) => !rows.includes(row));
      }
      if (orderColumn) {
        rows.sort((a, b) => {
          const [x, y] = [a[orderColumn!], b[orderColumn!]];
          const less =
            typeof x === "number" && typeof y === "number"
              ? x < y
              : String(x) < String(y);
          return (less ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      // Des COPIES, comme PostgREST : la ligne rendue par une lecture ne doit pas
      // être l'objet que la prochaine écriture mutera. Sans ça, l'état « d'avant »
      // que le noyau garde en main pour l'archiver (MIN-277) se trouvait modifié
      // par l'écriture qu'il précède — un alias que la vraie base n'a pas.
      return { data: rows.map((row) => ({ ...row })), error: null };
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
    query.gte = (column: string, value: unknown) => {
      filters.push((row) => String(row[column] ?? "") >= String(value));
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
    query.order = (column: string, options?: { ascending?: boolean }) => {
      orderColumn = column;
      ascending = options?.ascending !== false;
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

/**
 * Ce qu'une écriture FAIT SAVOIR (MIN-278) sort du module, et sort du process :
 * lignes d'activité, notifications de mention, notification d'écriture d'agent.
 * On l'espionne ici, on l'exerce dans ses propres tests — et sans ce mock, le
 * faux PostgREST de ce fichier (deux tables, `pages` et `page_versions`) rangerait
 * les `issue_events` parmi les versions, et l'historique compterait faux.
 */
// Signatures explicites : sans elles, `mock.calls` est typé sur un tuple vide
// et lire `c[1]` ne compile pas (même remarque que notifications.test.ts).
const announce = vi.hoisted(() => ({
  recordPageEvent: vi.fn<
    (
      service: unknown,
      params: {
        pageId: string;
        actorId: string | null;
        kind: "human" | "agent";
        type: string;
        mcpKeyId?: string | null;
      }
    ) => Promise<void>
  >(async () => {}),
  notifyAgentPageWrite: vi.fn<
    (
      service: unknown,
      params: { projectId: string; pageId: string; actorId: string }
    ) => Promise<void>
  >(async () => {}),
  notifyPageMentions: vi.fn<
    (
      service: unknown,
      params: {
        projectId: string;
        pageId: string;
        actorId: string | null;
        doc: unknown;
        previousDoc?: unknown;
        viaAssistant?: boolean;
        mcpKeyId?: string | null;
      }
    ) => Promise<void>
  >(async () => {}),
}));

vi.mock("@/lib/server/page-activity", () => ({
  recordPageEvent: announce.recordPageEvent,
  notifyAgentPageWrite: announce.notifyAgentPageWrite,
}));
vi.mock("@/lib/server/page-mentions", () => ({
  notifyPageMentions: announce.notifyPageMentions,
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async (_userId: string, projectId: string) =>
    h.access.has(projectId) ? { project: { id: projectId }, isOwner: true, isMember: true } : null,
}));

/**
 * Les NOMS des comptes, seule chose qui sorte encore du process côté historique
 * (l'API admin de GoTrue). Le reste de `auth-users` reste le vrai.
 */
vi.mock("@/lib/server/auth-users", async (importActual) => ({
  ...(await importActual<typeof import("./auth-users")>()),
  fetchAuthUsersById: async (_service: unknown, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        { id, email: `${id}@minddy.app`, user_metadata: { display_name: `Nom de ${id}` } },
      ])
    ),
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
import {
  getPageVersion,
  listPageVersions,
  restorePageVersion,
} from "./page-versions";
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
  h.versions = [];
  h.seq = 0;
  h.access = new Set([PROJECT]);
  announce.recordPageEvent.mockClear();
  announce.notifyAgentPageWrite.mockClear();
  announce.notifyPageMentions.mockClear();
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

  /* ── Le corps donné en MARKDOWN (MIN-170) ────────────────────────────────
     C'est par là que le brief collé du wizard de projet devient la page
     « Brief initial ». Ce qui se joue ici et qu'aucun type ne voit : le
     markdown est bien PROJETÉ (donc un titre reste un titre, pas une ligne de
     texte), et il n'atteint jamais la table — `markdown` n'est pas une colonne
     de `pages`, et l'y laisser filer ferait échouer l'insertion entière. */
  it("projette un corps donné en markdown", async () => {
    const result = await createPage({
      projectId: PROJECT,
      actorId: ACTOR,
      input: { title: "Brief initial", markdown: "## Le but\n\nUn board." },
    });
    expect(result.ok).toBe(true);

    const row = rowOf((result as { page: { id: string } }).page.id);
    const doc = row.content as { content: { type: string }[] };
    expect(doc.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
    ]);
    expect((row as unknown as Record<string, unknown>).markdown).toBeUndefined();
  });

  it("garde le JSON quand les deux formats sont là", async () => {
    // `content` est le format natif : un appelant qui l'envoie a déjà fait la
    // projection, et la refaire depuis un markdown de secours écraserait
    // exactement ce qu'il vient d'écrire.
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "natif" }] }],
    };
    const result = await createPage({
      projectId: PROJECT,
      actorId: ACTOR,
      input: { content, markdown: "## ignoré" },
    });
    expect(result.ok).toBe(true);
    expect(rowOf((result as { page: { id: string } }).page.id).content).toEqual(
      content
    );
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

  it("REFUSE un corps trop profond, là où le peser faisait tomber la requête", async () => {
    // Le garde-fou de taille était `JSON.stringify(content).length` : sur ce
    // document-ci il lève un RangeError avant d'avoir pu peser quoi que ce soit,
    // et c'est la requête entière qui tombait (MIN-348).
    const id = await create("A");
    let bomb: unknown = {};
    for (let i = 0; i < 100_000; i++) bomb = { type: "doc", content: [bomb] };

    const result = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: bomb },
    });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "pageTooDeep" });
    // Rien n'a été écrit : la page garde sa version.
    expect(rowOf(id).version).toBe(1);
  });

  it("REFUSE un `src` au protocole hostile, plutôt que de le ranger (MIN-350)", async () => {
    // Le `src` d'un bloc fichier ressort dans le `href` d'une vraie ancre, que
    // le clic ordinaire suit vraiment (components/pages/blocks/file-view.tsx).
    // La porte est ici, sur le chemin de TOUTES les surfaces d'écriture.
    const id = await create("A");
    const result = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [
            {
              type: "pageFile",
              attrs: { src: "javascript:alert(1)", name: "x.pdf" },
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 400,
      errorKey: "pageContentRefused",
    });
    expect(rowOf(id).version).toBe(1);
  });

  it("REFUSE un nœud que le schéma ne connaît pas, et nettoie les attributs de trop", async () => {
    const id = await create("A");
    const unknown = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: {
        content: { type: "doc", content: [{ type: "iframe", attrs: {} }] },
      },
    });
    expect(unknown).toMatchObject({ ok: false, errorKey: "pageContentRefused" });

    const cleaned = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { blockId: "b1", onclick: "alert(1)" },
              content: [{ type: "text", text: "x" }],
            },
          ],
        },
      },
    });
    if (!cleaned.ok) throw new Error(`écriture refusée : ${cleaned.errorKey}`);
    const paragraph = (rowOf(id).content as { content: { attrs: Record<string, unknown> }[] })
      .content[0];
    expect(paragraph.attrs).toEqual({ blockId: "b1" });
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

/* ─── Le texte de recherche (MIN-276) ─────────────────────────────────────────
   La colonne `search_text` est la projection markdown du corps, et c'est la
   SEULE chose que la recherche lit. Ce qui la rend fragile : elle est écrite
   par un rattrapage, après la réponse (`afterOrNow`), donc rien ne la réclame
   au moment de l'écriture. Ces cas-ci vérifient qu'elle atterrit vraiment, sur
   chacun des chemins ; que le rattrapage soit APPELÉ partout est vérifié à
   part, dans pages-search-paths.test.ts, sur l'arbre syntaxique du module.

   `vi.waitFor` parce que le travail est justement différé : hors d'une requête,
   `afterOrNow` le lance tout de suite mais ne l'attend pas — c'est son contrat,
   et le simuler autrement testerait autre chose que ce qui tourne. */

/** Le corps de la page, tel que la recherche le lira. */
const searchTextOf = (id: string) =>
  (rowOf(id) as unknown as Record<string, unknown>).search_text as
    | string
    | undefined;

async function expectSearchText(id: string, fragment: string) {
  await vi.waitFor(() => {
    expect(searchTextOf(id) ?? "").toContain(fragment);
  });
}

describe("le texte de recherche", () => {
  const body = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  it("est écrit à la création", async () => {
    const result = await createPage({
      projectId: PROJECT,
      actorId: ACTOR,
      input: { title: "Guide", content: body("mot-très-rare") },
    });
    if (!result.ok) throw new Error(result.errorKey);
    await expectSearchText(result.page.id, "mot-très-rare");
  });

  it("suit le corps à chaque écriture, et ne garde pas l'ancien", async () => {
    const page = await create("Guide");
    await updatePage({
      pageId: page,
      actorId: ACTOR,
      input: { content: body("première version") },
    });
    await expectSearchText(page, "première version");

    await updatePage({
      pageId: page,
      actorId: ACTOR,
      input: { content: body("seconde version") },
    });
    await expectSearchText(page, "seconde version");
    expect(searchTextOf(page)).not.toContain("première");
  });

  it("est écrit sur toute la branche dupliquée", async () => {
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await updatePage({
      pageId: child,
      actorId: ACTOR,
      input: { content: body("clé-de-voûte") },
    });

    const copy = await duplicatePage(root, ACTOR);
    if (!copy.ok) throw new Error(copy.errorKey);
    const childCopy = h.rows.find(
      (row) => (row as unknown as Row).parent_id === copy.page.id
    ) as unknown as Row;
    await expectSearchText(childCopy.id, "clé-de-voûte");
  });

  it("suit le corps du PARENT quand une sous-page part à la corbeille", async () => {
    // Le miroir du bloc sous-page (MIN-272) écrit le corps du parent sans que
    // personne ne l'ait ouvert : c'est une écriture de contenu comme une autre,
    // et le texte indexé doit la suivre — sinon le parent reste trouvable par
    // un bloc qui n'existe plus.
    const root = await create("Guide");
    const child = await create("Chapitre", root);
    await updatePage({
      pageId: root,
      actorId: ACTOR,
      input: {
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "intro-durable" }] },
            { type: "subpage", attrs: { pageId: child } },
          ],
        },
      },
    });
    await expectSearchText(root, "intro-durable");
    expect(searchTextOf(root)).toContain(child);

    await trashPage(child, ACTOR);
    await vi.waitFor(() => {
      expect(searchTextOf(root) ?? "").not.toContain(child);
    });
    expect(searchTextOf(root)).toContain("intro-durable");
  });

  it("ne repart pas pour un simple renommage", async () => {
    // Le titre entre dans l'index par la colonne générée : il n'a aucun texte à
    // rejouer, et monter un éditeur serveur pour un renommage serait payer la
    // projection pour rien.
    const page = await create("Guide");
    await updatePage({
      pageId: page,
      actorId: ACTOR,
      input: { content: body("corps-stable") },
    });
    await expectSearchText(page, "corps-stable");

    (rowOf(page) as unknown as Record<string, unknown>).search_text = "TÉMOIN";
    await updatePage({ pageId: page, actorId: ACTOR, input: { title: "Autre" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(searchTextOf(page)).toBe("TÉMOIN");
  });
});

/* ─── L'auteur, et l'historique (MIN-277) ──────────────────────────────────── */

describe("qui a écrit, et ce que l'écriture a recouvert", () => {
  const OTHER = "user-2";
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  /** Les versions d'une page, du plus ancien au plus récent, en base. */
  const versionsOf = (pageId: string) =>
    h.versions.filter((row) => row.page_id === pageId);

  /** L'archivage part par `afterOrNow`, donc après le retour de l'écriture. */
  async function expectVersions(pageId: string, count: number) {
    await vi.waitFor(() => {
      expect(versionsOf(pageId)).toHaveLength(count);
    });
  }

  it("pose l'auteur et la NATURE du geste sur toute écriture", async () => {
    const id = await create("Guide");
    expect(rowOf(id)).toMatchObject({ updated_by: ACTOR, updated_kind: "human" });

    // Un geste d'agent porte l'id du compte qui l'a permis, et c'est bien pour
    // ça qu'il faut la seconde colonne : sans elle, la page dirait « modifiée
    // par Clément » d'un texte que Clément n'a pas écrit.
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { content: doc("écrit par Numo") },
    });
    expect(rowOf(id)).toMatchObject({ updated_by: ACTOR, updated_kind: "agent" });

    // Un simple renommage compte : « modifiée par », pas « corps écrit par ».
    await updatePage({ pageId: id, actorId: OTHER, input: { title: "Autre" } });
    expect(rowOf(id)).toMatchObject({ updated_by: OTHER, updated_kind: "human" });
  });

  it("ne signe PAS le rangement — favori, déplacement", async () => {
    const id = await create("Guide");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: doc("le texte de Clément") },
    });

    // Épingler une page (le favori est partagé par le projet) ou la glisser
    // dans l'arbre ne dit rien de son contenu. Signer ces gestes ferait dire à
    // l'en-tête « modifiée par » quelqu'un qui n'a pas ouvert la page.
    await updatePage({ pageId: id, actorId: OTHER, input: { favorite: true } });
    expect(rowOf(id)).toMatchObject({ favorite: true, updated_by: ACTOR });

    const parent = await create("Dossier");
    await updatePage({ pageId: id, actorId: OTHER, input: { parent_id: parent } });
    expect(rowOf(id)).toMatchObject({ parent_id: parent, updated_by: ACTOR });
  });

  it("n'archive rien à la création ni à la duplication", async () => {
    const id = await create("Guide");
    const copy = await duplicatePage(id, ACTOR);
    if (!copy.ok) throw new Error(copy.errorKey);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.versions).toHaveLength(0);
    // La copie est une écriture NEUVE, de celui qui l'a demandée.
    expect(rowOf(copy.page.id)).toMatchObject({
      updated_by: ACTOR,
      updated_kind: "human",
    });
  });

  it("archive l'état RECOUVERT, attribué à qui l'avait écrit", async () => {
    const id = await create("Guide");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: doc("le texte de Clément") },
    });
    await expectVersions(id, 1);

    // L'agent écrase. Ce qu'on veut retrouver, c'est le texte D'AVANT, au nom
    // de celui qui l'avait écrit — c'est tout l'objet de MIN-277.
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { content: doc("réécrit par l'agent") },
    });
    await expectVersions(id, 2);

    const last = versionsOf(id).at(-1) as Record<string, unknown>;
    expect(last).toMatchObject({ author_id: ACTOR, author_kind: "human", version: 2 });
    expect(JSON.stringify(last.content)).toContain("le texte de Clément");
  });

  it("coalesce deux frappes rapprochées du MÊME auteur en une version", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("un") } });
    await expectVersions(id, 1);

    // Dix secondes plus tard, le même auteur : l'état intermédiaire ne vaut pas
    // une ligne. L'éditeur enregistre à la seconde — sans cette règle, un
    // paragraphe écrit d'une traite ferait quarante versions.
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("deux") } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(versionsOf(id)).toHaveLength(1);
  });

  it("n'en coalesce JAMAIS deux d'auteurs différents", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("un") } });
    await expectVersions(id, 1);

    // Même fenêtre de cinq minutes, mais quelqu'un d'autre écrit : l'état de
    // Clément est archivé quoi qu'il arrive. C'est exactement celui qu'on
    // viendra chercher.
    await updatePage({ pageId: id, actorId: OTHER, input: { content: doc("deux") } });
    await expectVersions(id, 2);
    expect(versionsOf(id).at(-1)).toMatchObject({ author_id: ACTOR });
  });

  it("rend l'historique le plus récent d'abord, et nomme minddy sur un geste d'agent", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("humain") } });
    await expectVersions(id, 1);
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { content: doc("agent") },
    });
    await expectVersions(id, 2);
    await updatePage({ pageId: id, actorId: OTHER, input: { content: doc("humain 2") } });
    await expectVersions(id, 3);

    const list = await listPageVersions(id, ACTOR);
    if (!list.ok) throw new Error(list.errorKey);
    expect(list.data.map((v) => v.version)).toEqual([3, 2, 1]);
    // L'écriture de l'agent se reconnaît dans la liste : elle porte « minddy »
    // et non le nom du compte qui l'a permise.
    expect(list.data[0]).toMatchObject({ author_kind: "agent", author_name: "minddy" });
    expect(list.data[2]).toMatchObject({
      author_kind: "human",
      author_name: `Nom de ${ACTOR}`,
    });
  });

  it("refuse l'historique d'une page d'un projet auquel on n'a pas accès", async () => {
    const id = await create("Guide");
    h.access = new Set();
    expect(await listPageVersions(id, ACTOR)).toMatchObject({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
  });

  it("garde l'historique consultable sur une page CORBEILLÉE", async () => {
    // C'est justement là qu'on va chercher : « ça a disparu, remonte à avant »
    // est le geste d'après l'incident.
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("texte") } });
    await expectVersions(id, 1);
    await trashPage(id, ACTOR);

    const list = await listPageVersions(id, ACTOR);
    if (!list.ok) throw new Error(list.errorKey);
    expect(list.data).toHaveLength(1);
  });

  it("restaure une version, et archive l'état d'avant la restauration", async () => {
    const id = await create("Guide");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { title: "Décision", content: doc("la bonne version") },
    });
    await expectVersions(id, 1);
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { title: "Réécrite", content: doc("la version de l'agent") },
    });
    await expectVersions(id, 2);

    const list = await listPageVersions(id, ACTOR);
    if (!list.ok) throw new Error(list.errorKey);
    const wanted = list.data.find((v) => v.version === 2);
    if (!wanted) throw new Error("version introuvable");

    const restored = await restorePageVersion(id, wanted.id, OTHER);
    if (!restored.ok) throw new Error(restored.errorKey);
    expect(JSON.stringify(restored.data.content)).toContain("la bonne version");
    // Le titre revient avec le corps : ce sont trois champs d'un même état.
    expect(restored.data.title).toBe("Décision");
    expect(rowOf(id)).toMatchObject({ updated_by: OTHER, updated_kind: "human" });

    // Et l'état d'avant la restauration — celui de l'agent — est archivé, hors
    // coalescence : restaurer par erreur se défait.
    await expectVersions(id, 3);
    expect(versionsOf(id).at(-1)).toMatchObject({ author_kind: "agent" });
  });

  it("ne rend pas une version qui n'appartient pas à la page demandée", async () => {
    const mine = await create("Guide");
    const other = await create("Notes");
    await updatePage({ pageId: other, actorId: ACTOR, input: { content: doc("ailleurs") } });
    await expectVersions(other, 1);
    const strayId = versionsOf(other)[0].id as string;

    expect(await getPageVersion(mine, strayId, ACTOR)).toMatchObject({
      ok: false,
      status: 404,
      errorKey: "pageVersionNotFound",
    });
  });
});

/**
 * MIN-278 — ce qu'une écriture de page FAIT SAVOIR.
 *
 * Ici on garde le BRANCHEMENT, et lui seul : quel geste pose quelle ligne, qui
 * est prévenu, et surtout ce qui ne doit RIEN déclencher. La règle de ce qu'est
 * une mention vit dans lib/pages-mentions.test.ts ; la coalescence des lignes
 * d'activité et le déplacement des notifications, dans les modules qui les
 * portent. Ce qu'aucun des trois ne dit, c'est si le noyau les appelle — et
 * c'est justement ce qui s'oublie en ajoutant un chemin d'écriture.
 */
describe("ce qu'une écriture fait savoir (MIN-278)", () => {
  const OTHER = "user-2";
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  /** Les annonces partent par `afterOrNow`, donc après le retour de l'écriture. */
  const settled = () => vi.waitFor(() => expect(announce.recordPageEvent).toHaveBeenCalled());

  const events = () => announce.recordPageEvent.mock.calls.map((c) => c[1]);

  it("pose « créée » à la création, et « modifiée » à l'écriture suivante", async () => {
    const id = await create("Guide");
    await settled();
    expect(events()).toEqual([
      { pageId: id, actorId: ACTOR, kind: "human", type: "page_created" },
    ]);

    await updatePage({ pageId: id, actorId: OTHER, input: { content: doc("du texte") } });
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    expect(events()[1]).toMatchObject({ type: "page_updated", actorId: OTHER });
  });

  it("pose « corbeille » puis « restaurée », sur la RACINE du geste seule", async () => {
    const parent = await create("Dossier");
    await create("Annexe", parent);
    announce.recordPageEvent.mockClear();

    await trashPage(parent, ACTOR);
    await settled();
    // Deux pages sont parties, une seule ligne : sinon corbeiller un dossier de
    // vingt pages ferait vingt lignes pour un geste.
    expect(events()).toEqual([
      { pageId: parent, actorId: ACTOR, kind: "human", type: "page_trashed" },
    ]);

    await restorePage(parent, ACTOR);
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    expect(events()[1]).toMatchObject({ pageId: parent, type: "page_restored" });
  });

  it("garde la NATURE du geste quand c'est l'agent qui corbeille ou restaure", async () => {
    // La corbeille est ouverte à Numo (`move_to_trash`, type `page`). Sans le
    // mot « agent », la ligne dirait « Clément a mis la page à la corbeille »
    // d'un geste que Clément n'a pas fait — la fausse attribution que le reste
    // du ticket évite déjà sur les écritures.
    const id = await create("Guide");
    announce.recordPageEvent.mockClear();

    await trashPage(id, ACTOR, "agent");
    await settled();
    expect(events()[0]).toMatchObject({ type: "page_trashed", kind: "agent" });

    await restorePage(id, ACTOR, "agent");
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    expect(events()[1]).toMatchObject({ type: "page_restored", kind: "agent" });
  });

  it("ne dit RIEN d'un rangement — épingler, glisser dans l'arbre", async () => {
    const id = await create("Guide");
    const parent = await create("Dossier");
    await settled();
    announce.recordPageEvent.mockClear();

    await updatePage({ pageId: id, actorId: ACTOR, input: { favorite: true } });
    await updatePage({ pageId: id, actorId: ACTOR, input: { parent_id: parent } });

    // Réordonner la sidebar n'est pas modifier une page : la même frontière que
    // celle de la signature « modifiée par » (MIN-277).
    expect(announce.recordPageEvent).not.toHaveBeenCalled();
  });

  it("prévient le lanceur du run — et LUI SEUL — quand l'agent écrit", async () => {
    const id = await create("Guide");
    await settled();
    announce.notifyAgentPageWrite.mockClear();

    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { content: doc("réécrit par l'agent") },
    });

    await vi.waitFor(() => expect(announce.notifyAgentPageWrite).toHaveBeenCalledTimes(1));
    // `actorId` EST le destinataire : les six outils d'écriture tournent sous
    // l'id du compte qui les a permis.
    expect(announce.notifyAgentPageWrite.mock.calls[0][1]).toEqual({
      projectId: PROJECT,
      pageId: id,
      actorId: ACTOR,
    });
  });

  it("porte l'identité de l'AGENT jusqu'aux citations et à l'activité", async () => {
    // Le fond du problème (MIN-278) : l'écriture d'un agent passe sous l'id du
    // compte qui l'a permise. Sans ces deux mots, une citation posée par Numo se
    // lirait « Clément vous a mentionné » — d'une phrase que Clément n'a pas
    // écrite. Et par le MCP, on connaît le nom de l'agent : c'est lui qui doit
    // descendre jusqu'à la ligne, comme sur la timeline d'un ticket.
    const id = await create("Guide");
    announce.notifyPageMentions.mockClear();
    announce.recordPageEvent.mockClear();

    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      mcpKeyId: "key-1",
      input: { content: doc("à @Nom de user-2 de trancher") },
    });

    await vi.waitFor(() => expect(announce.notifyPageMentions).toHaveBeenCalled());
    expect(announce.notifyPageMentions.mock.calls[0][1]).toMatchObject({
      viaAssistant: true,
      mcpKeyId: "key-1",
    });
    expect(events()[0]).toMatchObject({ type: "page_updated", mcpKeyId: "key-1" });
  });

  it("ne prévient personne quand l'écriture est humaine", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("à moi") } });
    await settled();
    expect(announce.notifyAgentPageWrite).not.toHaveBeenCalled();
  });

  it("passe le document d'AVANT au scan de mentions — le diff est à ce prix", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("un") } });
    await vi.waitFor(() => expect(announce.notifyPageMentions).toHaveBeenCalledTimes(2));

    const second = announce.notifyPageMentions.mock.calls[1][1];
    expect(second.pageId).toBe(id);
    expect(second.doc).toMatchObject(doc("un"));
    // Sans cet état d'avant, chaque enregistrement re-notifierait toutes les
    // mentions de la page — une rafale d'autosaves en ferait dix.
    expect(second.previousDoc).toBeDefined();
  });

  it("ne scanne PAS les mentions d'une duplication", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("@Nom de user-2") } });
    await vi.waitFor(() => expect(announce.notifyPageMentions).toHaveBeenCalledTimes(2));
    announce.notifyPageMentions.mockClear();

    // Recopier un texte n'est pas citer quelqu'un : dupliquer une page
    // repingerait tous les noms qu'elle porte.
    await duplicatePage(id, ACTOR);
    await vi.waitFor(() =>
      expect(announce.recordPageEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "page_created" })
      )
    );
    expect(announce.notifyPageMentions).not.toHaveBeenCalled();
  });
});
