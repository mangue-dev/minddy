import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-266 — the server surface of the pages, over a table in memory.
 *
 * We ONLY mock what comes out of the process: the `pages` table and project
 * access control. The real `lib/server/pages.ts` runs underneath; it is the
 * code we want to see reject a cycle, trash an entire subtree, and restore it.
 *
 * What these tests keep, in the order of what costs the most to miss :
 *
 * - the CYCLE. Unlimited depth + free reparenting = a possible loop,
 * and any descent of the tree then goes into infinite recursion. 409, and
 * NO writing — not even other fields in the same PATCH.
 * - the RECURSIVE trash. The gesture that calls it most often is
 * the deletion of a sub-page block in the body of the parent (MIN-272):
 * leaving the descendants alive would cause twenty orphan pages to appear at the
 * root of the sidebar for a deleted line of text.
 * - RESTORATION of a page whose parent remained in the trash: it
 * goes back to the root. Without it, it returns invisible — worse than deleted.
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
  /** HISTORY (MIN-277) — `page_versions`, the second table of the module. */
  versions: [] as Record<string, unknown>[],
  /** Projects to which the actor has access. Empty = everything is “not found”. */
  access: new Set<string>(),
  /** Optional edit injected between discardPage's initial read and its RPC. */
  beforeDiscard: null as (() => void) | null,
  seq: 0,
}));

/**
 * False PostgREST: an array in memory and the few operators that
 * lib/server/pages.ts uses (eq, is, in, or, order + insert/update/delete).
 * Each request is "thenable" like those of postgrest-js, which allows
 * wait for it directly or end it with `single()` / `maybeSingle()`.
 */
vi.mock("@/lib/supabase-service", () => {
  type Filter = (row: Record<string, unknown>) => boolean;

  // Two tables, and you need two: a history line carries a
  // `project_id` and no `deleted_at`, so mixed with the pages it would come out
  // in the sidebar list — a false positive which would cast doubt on the tests
  // rather than code.
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
        // An object OR an array: duplication writes an entire branch of a
        // shot (MIN-272), and a half-posed copy would be a false tree.
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
                  // The real `default now()`: coalescence reads this column,
                  // and a frozen timestamp would make the test pass as true.
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
      // COPIES, like PostgREST: the line rendered by a read must not
      // be the object that the next write will mutate. Without that, the state “before”
      // that the kernel keeps in hand for archiving (MIN-277) was modified
      // by the writing it precedes — an alias that the real base does not have.
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
      // “id.eq.X,deleted_root_id.eq.X” — the only form used.
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

  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== "discard_blank_page_guarded") {
      return { data: null, error: new Error(`unexpected RPC: ${name}`) };
    }
    h.beforeDiscard?.();
    h.beforeDiscard = null;
    const row = h.rows.find(
      (candidate) =>
        candidate.id === args.p_page_id && candidate.deleted_at === null,
    );
    if (!row) return { data: { status: "not_found" }, error: null };

    const blocks = (row.content as { content?: unknown[] } | null)?.content;
    const only = Array.isArray(blocks) ? blocks[0] as {
      type?: string;
      content?: unknown[];
    } : null;
    const blank =
      !Array.isArray(blocks) ||
      blocks.length === 0 ||
      (blocks.length === 1 && only?.type === "paragraph" && !only.content?.length);
    const hasChildren = h.rows.some(
      (candidate) =>
        candidate.parent_id === row.id && candidate.deleted_at === null,
    );
    if (
      String(row.title).trim() !== "" ||
      Boolean(row.icon) ||
      !blank ||
      hasChildren
    ) {
      return { data: { status: "not_empty" }, error: null };
    }

    h.rows = h.rows.filter((candidate) => candidate !== row);
    return {
      data: { status: "discarded", parent_id: row.parent_id },
      error: null,
    };
  };

  return { getServiceClient: () => ({ from, rpc }) };
});

/**
 * What a write MAKES KNOW (MIN-278) leaves the module, and leaves the process:
 * activity lines, mention notifications, agent write notification.
 * We spy on it here, we exercise it in our own tests — and without this mock, the
 * false PostgREST of this file (two tables, `pages` and `page_versions`) would rank
 * the `issue_events` among the versions, and the history would count false.
 */
// Explicit signatures: without them, `mock.calls` is typed on an empty tuple
// and reading `c[1]` does not compile (same remark as notifications.test.ts).
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
 * The NAMES of the accounts, the only thing that still comes out of the process on the historical side
 * (the GoTrue admin API). The rest of `auth-users` remains the real one.
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

/** Creates a page and renders its id — the normal path, never a hand insert. */
async function create(title: string, parentId: string | null = null) {
  const result = await createPage({
    projectId: PROJECT,
    actorId: ACTOR,
    input: { title, parent_id: parentId },
  });
  if (!result.ok) throw new Error(`page creation refused: ${result.errorKey}`);
  return result.page.id;
}

const rowOf = (id: string) => h.rows.find((row) => row.id === id) as unknown as Row;

beforeEach(() => {
  h.rows = [];
  h.versions = [];
  h.seq = 0;
  h.beforeDiscard = null;
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

  /* ── The body given in MARKDOWN (MIN-170) ────────────────────────────────__keep becomes the
 “Initial Brief” page. What is happening here and that no guy sees: the
 markdown is indeed PROJECTED (so a title remains a title, not a line of
 text), and it never reaches the table — `markdown` is not a column
 of `pages`, and letting it slip there would cause it to fail the entire insertion. */
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
    // `content` is the native format: a caller who sends it has already made the
    // projection, and redoing it from a backup markdown would overwrite
    // exactly what he just wrote.
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

    // A rename alone does not count as a body write.
    const renamed = await updatePage({ pageId: id, actorId: ACTOR, input: { title: "Guide" } });
    if (!renamed.ok) throw new Error("écriture refusée");
    expect(renamed.page.version).toBe(2);
  });

  it("REFUSE de mettre une page sous un de ses descendants, sans rien écrire", async () => {
    // A → B → C: reparenting A under C would close the loop.
    const a = await create("A");
    const b = await create("B", a);
    const c = await create("C", b);

    const result = await updatePage({
      pageId: a,
      actorId: ACTOR,
      input: { parent_id: c, title: "Renommée au passage" },
    });

    expect(result).toMatchObject({ ok: false, status: 409, errorKey: "pageCycle" });
    // The refusal is TOTAL: the title of the same request is not passed either.
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
    // At the end of the ROOT's siblings, therefore after A — not in the position
    // it occupied under A, which no longer makes sense here.
    expect(result.page.position > rowOf(a).position).toBe(true);
    expect(rowOf(sibling).parent_id).toBe(a);
  });

  it("REFUSE un corps trop profond, là où le peser faisait tomber la requête", async () => {
    // The size guardrail was `JSON.stringify(content).length`: for this
    // document, stringification raises a RangeError before anything can be
    // measured, and the entire request failed (MIN-348).
    const id = await create("A");
    let bomb: unknown = {};
    for (let i = 0; i < 100_000; i++) bomb = { type: "doc", content: [bomb] };

    const result = await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: bomb },
    });

    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "pageTooDeep" });
    // Nothing has been written: the page keeps its version.
    expect(rowOf(id).version).toBe(1);
  });

  it("REFUSE un `src` au protocole hostile, plutôt que de le ranger (MIN-350)", async () => {
    // The `src` of a file block appears in the `href` of a real anchor, which
    // ordinary click really follows (components/pages/blocks/file-view.tsx).
    // The door is here, in the way of ALL writing surfaces.
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
    // Descendants point to the root: the trash can only displays one line.
    expect(rowOf(b).deleted_root_id).toBe(a);
    expect(rowOf(c).deleted_root_id).toBe(a);
    expect(rowOf(elsewhere).deleted_at).toBeNull();
  });

  it("ne retouche pas une sous-page déjà corbeillée pour elle-même", async () => {
    const a = await create("A");
    const b = await create("B", a);
    await trashPage(b, ACTOR);

    await trashPage(a, ACTOR);

    // B keeps ITS root (null): restoring A does not bring it back, no one has it
    // asked — it is restorable for itself.
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
  it("permanently deletes a page that remained blank", async () => {
    const id = await create("");

    expect(await discardPage(id, ACTOR)).toEqual({ ok: true });
    // No line marked: the line no longer exists. That's the whole point —
    // A page that we created and then left untouched does not need to clutter
    // the trash.
    expect(h.rows.find((row) => row.id === id)).toBeUndefined();
  });

  it("rejects a page with a title", async () => {
    const id = await create("Cadrage");
    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 409,
      errorKey: "pageNotEmpty",
    });
    expect(rowOf(id).deleted_at).toBeNull();
  });

  it("rejects a page with body text", async () => {
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

  it("rejects a blank page that has a child", async () => {
    const parent = await create("");
    const child = await create("Dedans", parent);

    expect(await discardPage(parent, ACTOR)).toMatchObject({
      ok: false,
      errorKey: "pageNotEmpty",
    });
    expect(rowOf(parent)).toBeDefined();
    expect(rowOf(child)).toBeDefined();
  });

  it("accepts the empty paragraph rendered for a new page", async () => {
    const id = await create("");
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      input: { content: { type: "doc", content: [{ type: "paragraph" }] } },
    });

    expect(await discardPage(id, ACTOR)).toEqual({ ok: true });
  });

  it("removes the subpage block from the parent body", async () => {
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
    // A block that cites a destroyed page is a dead link in the parent document:
    // it leaves with the page, just as it does when the page enters the trash
    // (MIN-272).
    expect(JSON.stringify(rowOf(parent).content)).not.toContain(child);
  });

  it("returns 404 outside the project without deleting anything", async () => {
    const id = await create("");
    h.access = new Set();
    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(h.rows.find((row) => row.id === id)).toBeDefined();
  });

  it("preserves an edit committed after the initial blank-page read", async () => {
    const id = await create("");
    h.beforeDiscard = () => {
      Object.assign(rowOf(id), {
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Newer" }] },
          ],
        },
        version: 2,
      });
    };

    expect(await discardPage(id, ACTOR)).toMatchObject({
      ok: false,
      status: 409,
      errorKey: "pageNotEmpty",
    });
    expect(JSON.stringify(rowOf(id).content)).toContain("Newer");
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
    // The tree is found as is: nothing has been detached.
    expect(rowOf(b).parent_id).toBe(a);
    expect(rowOf(c).parent_id).toBe(b);
  });

  it("remonte à la racine une page dont le parent est resté à la corbeille", async () => {
    const parent = await create("Parent");
    const child = await create("Enfant", parent);

    // We trash the child alone, then the parent: two distinct deletions.
    await trashPage(child, ACTOR);
    await trashPage(parent, ACTOR);

    expect(await restorePage(child, ACTOR)).toMatchObject({ ok: true, restored: 1 });

    // Going back under an invisible parent would make a page not found in the
    // sidebar: poorly placed is better than absent.
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
 * MIN-272 — the MIRROR: the `subpage` block in the parent's body.
 *
 * The same information is carried in two places, and that's where all the
 * traps are. `parent_id` is the truth, the block is only a view of it — and it is the
 * server which keeps the view up to date, because the gesture most often starts from the
 * sidebar, without anyone having the parent open.
 *
 * The document side counterpart (deletion detection of the block in the editor,
 * pure functions) is in lib/pages-subpage.test.ts.
 */
describe("le bloc sous-page dans le corps du parent (MIN-272)", () => {
  /** A body that quotes `pageId`, surrounded by some text. */
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
    // The MOVED version: this is what sends the client into a merge (MIN-271)
    // when the parent is open, so the deletion is applied without noise.
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
    // The brand does not survive: it is the next move to the trash that
    // will say what it is then.
    expect(rowOf(child).parent_block_removed).toBe(false);
  });

  it("n'INVENTE pas de bloc pour une page née dans la sidebar", async () => {
    // The opposite-direction trap: a page created from the tree has never had a
    // block in its parent. Restoring it must not add one to a document that no
    // one wrote that way.
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
    // Descendant blocks live in bodies that enter the trash at the same time:
    // rewriting them would do needless work and could restore pages without
    // their links.
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
    // Someone moves a block back to the same page before we restore.
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
    // The mirror is a convenience, not a condition: refusing deletion because
    // the view failed to follow would be the wrong trade-off.
    const parent = await create("Guide");
    const child = await create("Chapitre", parent);
    rowOf(parent).content = null as unknown as Row["content"];

    const result = await trashPage(child, ACTOR);

    expect(result).toMatchObject({ ok: true, trashed: 1 });
    expect(rowOf(child).deleted_at).not.toBeNull();
  });
});

/**
 * MIN-272 — the DUPLICATION of a page.
 *
 * What is expensive to miss can be summed up in one sentence: a copy whose blocks
 * still point to the ORIGINALS. We would have two trees in the sidebar and
 * a single set of links — a copy that we believe to be independent and which sends
 * elsewhere, which we only discover by clicking.
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
    // Three pages copied, so six in total.
    expect(h.rows).toHaveLength(6);
    // The root of the copy goes AFTER the original in its siblings.
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
    // And what he cites is indeed THE child's copy: same title, parent copied.
    expect(rowOf(cited!).title).toBe("Chapitre");
    expect(rowOf(cited!).parent_id).toBe(result.page.id);
    // The original hasn't moved a bit.
    expect(citedBy(root)).toEqual([child]);
  });

  it("laisse INTACT un lien qui sort de la branche copiée", async () => {
    // A project page that is not in the copy must continue to be
    // quoted as is: we copy a branch, not the world around it.
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

/* ─── The search text (MIN-276) ─────────────────────────────────────────────
   The `search_text` column is the body's Markdown projection, and it is the
   ONLY thing the search reads. It is fragile because a catch-up writes it after
   the response (`afterOrNow`), so nothing requires it at write time. These cases
   verify that it lands on every path; that the catch-up is CALLED everywhere is
   checked separately in pages-search-paths.test.ts, using the module's syntax tree.

   `vi.waitFor` is necessary because the work is deliberately deferred:
   outside a request, `afterOrNow` starts it immediately but does not await it.
   That is its contract, and simulating it differently would test something else. */

/** The body of the page, as search will read it. */
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
    // The subpage mirror (MIN-272) writes the parent's body even when no one has
    // opened it. It is content writing like any other, and the indexed text must
    // follow it — otherwise the parent remains searchable by a block that no
    // longer exists.
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
    // The title enters the index through the generated column: it has no text to
    // play again, and set up a server editor for renaming would pay the
    // projection for nothing.
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

/* ─── The author and the history (MIN-277) ─────────────────────────────────── */

describe("who wrote, and what the writing covered", () => {
  const OTHER = "user-2";
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  /** The versions of a page, from oldest to newest, in the database. */
  const versionsOf = (pageId: string) =>
    h.versions.filter((row) => row.page_id === pageId);

  /** Archiving runs through `afterOrNow`, so it happens after the write returns. */
  async function expectVersions(pageId: string, count: number) {
    await vi.waitFor(() => {
      expect(versionsOf(pageId)).toHaveLength(count);
    });
  }

  it("pose l'auteur et la NATURE du geste sur toute écriture", async () => {
    const id = await create("Guide");
    expect(rowOf(id)).toMatchObject({ updated_by: ACTOR, updated_kind: "human" });

    // An agent gesture carries the id of the account that authorized it. That is
    // why the second column matters: without it, the page would say “modified by
    // Clément” for text that Clément did not write.
    await updatePage({
      pageId: id,
      actorId: ACTOR,
      kind: "agent",
      input: { content: doc("écrit par Numo") },
    });
    expect(rowOf(id)).toMatchObject({ updated_by: ACTOR, updated_kind: "agent" });

    // A simple rename counts: “modified by”, not “body written by”.
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

    // Pin a page (the favorite is shared by the project) or drag it
    // in the tree says nothing about its content. Signing these gestures would mean
    // the header “edited by” someone who didn't open the page.
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
    // The copy is a NEW handwriting, from the person who requested it.
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

    // The agent overwrites the page. We need to find the text FROM BEFORE under
    // the name of the person who wrote it — that is the whole point of MIN-277.
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

    // Ten seconds later, the same author writes again: the intermediate state is
    // not worth a history entry. The editor records every second; without this
    // rule, a paragraph written in one pass would create forty versions.
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("deux") } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(versionsOf(id)).toHaveLength(1);
  });

  it("n'en coalesce JAMAIS deux d'auteurs différents", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("un") } });
    await expectVersions(id, 1);

    // The same five-minute window, but someone else writes: Clément's state is
    // archived regardless. That is exactly the version we will need to retrieve.
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
    // The agent’s handwriting can be recognized in the list: it bears “minddy”
    // and not the name of the account that enabled it.
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
    // This is precisely where we are going to look: “it has disappeared, goes back to before”
    // is the gesture after the incident.
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
    // The title returns with the body: these are three fields of the same state.
    expect(restored.data.title).toBe("Décision");
    expect(rowOf(id)).toMatchObject({ updated_by: OTHER, updated_kind: "human" });

    // And the state before the restoration — that of the agent — is archived, excluding
    // coalescence: restore by mistake undoes.
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
 * MIN-278 — what a page write MAKES KNOWN.
 *
 * Here we keep only the CONNECTION: which gesture creates which line, who is
 * notified, and especially what must not trigger ANYTHING. The rule for what
 * constitutes a mention lives in lib/pages-mentions.test.ts; activity-line
 * coalescing and notification routing live in the modules that implement them.
 * None of those three says whether the kernel calls them — and that is exactly
 * what gets forgotten when a write path is added.
 */
describe("ce qu'une écriture fait savoir (MIN-278)", () => {
  const OTHER = "user-2";
  const doc = (text: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

  /** Announcements are dispatched through `afterOrNow`, after the write returns. */
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
    // Two pages are gone, only one line: otherwise trash a file of
    // twenty pages would make twenty lines for one gesture.
    expect(events()).toEqual([
      { pageId: parent, actorId: ACTOR, kind: "human", type: "page_trashed" },
    ]);

    await restorePage(parent, ACTOR);
    await vi.waitFor(() => expect(events()).toHaveLength(2));
    expect(events()[1]).toMatchObject({ pageId: parent, type: "page_restored" });
  });

  it("garde la NATURE du geste quand c'est l'agent qui corbeille ou restaure", async () => {
    // The Recycle Bin is open to Numo (`move_to_trash`, type `page`). Without the
    // word “agent”, the line would say “Clément put the page in the trash” for a
    // gesture Clément did not make — the false attribution that the rest of the
    // ticket already avoids for writes.
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

    // Reordering the sidebar does not modify a page: it falls on the same side
    // of the “modified by” boundary as pinning (MIN-277).
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
    // `actorId` IS the recipient: the six writing tools run under
    // the id of the account that allowed them.
    expect(announce.notifyAgentPageWrite.mock.calls[0][1]).toEqual({
      projectId: PROJECT,
      pageId: id,
      actorId: ACTOR,
    });
  });

  it("porte l'identité de l'AGENT jusqu'aux citations et à l'activité", async () => {
    // The root of the problem (MIN-278): an agent's write uses the id of the
    // account that authorized it. Without these two fields, a quote created by
    // Numo would read “Clément mentioned you” even though Clément did not write
    // the sentence. Through MCP we know the agent's name, so that identity must
    // reach the activity line, as it does on a ticket timeline.
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
    // Without this state before, each record would re-notify all the
    // mentions of the page — a burst of autosaves would make ten.
    expect(second.previousDoc).toBeDefined();
  });

  it("ne scanne PAS les mentions d'une duplication", async () => {
    const id = await create("Guide");
    await updatePage({ pageId: id, actorId: ACTOR, input: { content: doc("@Nom de user-2") } });
    await vi.waitFor(() => expect(announce.notifyPageMentions).toHaveBeenCalledTimes(2));
    announce.notifyPageMentions.mockClear();

    // Copying a text is not quoting someone: duplicating a page
    // would repin all the names it bears.
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
