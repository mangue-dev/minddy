import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-273 — les six outils de page, EXERCÉS PAR LEURS VRAIS CALLBACKS.
 *
 * Ce test ne relit pas des schémas : il enregistre les tools contre un serveur
 * qui GARDE les callbacks, puis les appelle comme le ferait un client MCP. Tout
 * ce qui est entre les deux tourne pour de vrai — la garde d'accès, le noyau
 * `lib/server/pages.ts`, le compteur de `version`, et surtout la projection
 * markdown ⇄ ProseMirror (MIN-269), qui monte un éditeur tiptap sur un DOM
 * installé à la volée. C'est ce dernier point que ni la relecture ni un test de
 * catalogue ne peuvent dire : un aller-retour qui perd un bloc n'a aucun
 * symptôme avant qu'un agent ne réécrive une page.
 *
 * On ne moque QUE ce qui sort du process : la table `pages` et l'accès projet.
 * Le faux PostgREST est celui de lib/server/pages.test.ts, pour la même raison
 * qu'il existe là-bas — le vrai code serveur doit tourner au-dessus.
 */

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  access: new Set<string>(),
  seq: 0,
}));

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
    query.eq = (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    };
    query.is = (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    };
    query.order = (column: string) => {
      orderColumn = column;
      return query;
    };
    query.limit = () => query;
    query.single = async () => {
      const { data } = run();
      return {
        data: data?.[0] ?? null,
        error: data?.length ? null : new Error("no row"),
      };
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
    h.access.has(projectId)
      ? {
          project: { id: projectId, key: "MIN", name: "minddy", owner_id: "user-1" },
          isOwner: true,
          isMember: true,
        }
      : null,
}));

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPageTools } from "./page-tools";

const ACTOR = "user-1";
const PROJECT = "11111111-1111-4111-8111-111111111111";

/** L'enregistreur qui GARDE les callbacks — c'est lui qui rend le test réel. */
type Callback = (
  args: Record<string, unknown>,
  extra: unknown
) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

const callbacks = new Map<string, Callback>();

registerPageTools({
  registerTool(name: string, _config: unknown, callback: Callback) {
    callbacks.set(name, callback);
  },
} as unknown as McpServer);

/** Un appel de tool, comme le SDK le fait : les arguments, et l'AuthInfo. */
async function call(
  name: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
  const callback = callbacks.get(name);
  if (!callback) throw new Error(`${name} n'est pas enregistré`);
  const result = await callback(args, {
    authInfo: { extra: { userId: ACTOR, keyId: "key-1" } },
  });
  return {
    ok: !result.isError,
    payload: JSON.parse(result.content[0].text) as Record<string, unknown>,
  };
}

/** Crée une page par le VRAI tool et rend son id. */
async function createPage(
  title: string,
  markdown = "",
  parentPageId?: string
): Promise<string> {
  const { ok, payload } = await call("minddy_create_page", {
    project_id: PROJECT,
    title,
    markdown,
    ...(parentPageId ? { parent_page_id: parentPageId } : {}),
  });
  expect(ok, JSON.stringify(payload)).toBe(true);
  return payload.page_id as string;
}

beforeEach(() => {
  h.rows = [];
  h.seq = 0;
  h.access = new Set([PROJECT]);
});

describe("minddy_list_pages", () => {
  it("rend un arbre à trois niveaux à plat, avec le parent de chacun", async () => {
    const guide = await createPage("Guide");
    const install = await createPage("Installation", "", guide);
    const macos = await createPage("macOS", "", install);

    const { ok, payload } = await call("minddy_list_pages", { project_id: PROJECT });
    expect(ok).toBe(true);
    expect(payload.count).toBe(3);
    const pages = payload.pages as Array<Record<string, unknown>>;
    expect(pages.map((p) => [p.title, p.parent_page_id])).toEqual([
      ["Guide", null],
      ["Installation", guide],
      ["macOS", install],
    ]);
    // Aucun corps dans la liste : c'est la carte, pas les documents.
    expect(pages.every((p) => !("markdown" in p))).toBe(true);
  });

  it("ne rend rien d'un projet auquel la clé n'a pas accès", async () => {
    h.access = new Set();
    const { ok, payload } = await call("minddy_list_pages", { project_id: PROJECT });
    expect(ok).toBe(false);
    expect((payload.error as { code: string }).code).toBe("project_not_found");
  });
});

describe("minddy_get_page", () => {
  const RICH = [
    "## Décision",
    "",
    "On garde **tiptap**, et [la raison](https://minddy.app) tient en un mot.",
    "",
    "- [ ] écrire la projection",
    "- [x] la tester",
    "",
    "> ce qui compte",
    "",
    "```ts",
    "const ok = true;",
    "```",
  ].join("\n");

  it("relit un document à blocs riches sans en perdre un caractère", async () => {
    const page = await createPage("Architecture", RICH);

    const { ok, payload } = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(ok).toBe(true);
    expect(payload.markdown).toBe(RICH);
    expect(payload.title).toBe("Architecture");
    expect(payload.version).toBe(1);
  });

  it("annonce les sous-pages directes, pour descendre sans second appel", async () => {
    const guide = await createPage("Guide");
    const child = await createPage("Installation", "", guide);
    await createPage("macOS", "", child);

    const { payload } = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: guide,
    });
    expect(payload.subpages).toEqual([
      { page_id: child, title: "Installation", icon: null },
    ]);
  });

  it("ne rend pas une page d'un autre projet", async () => {
    const other = "22222222-2222-4222-8222-222222222222";
    h.access.add(other);
    const page = await createPage("Guide");

    const { ok, payload } = await call("minddy_get_page", {
      project_id: other,
      page_id: page,
    });
    expect(ok).toBe(false);
    expect((payload.error as { code: string }).code).toBe("page_not_found");
  });
});

describe("minddy_create_page", () => {
  it("crée sous un parent, et prend le titre de l'en-tête quand on n'en donne pas", async () => {
    const guide = await createPage("Guide");

    const { ok, payload } = await call("minddy_create_page", {
      project_id: PROJECT,
      title: "",
      markdown: "# 📘 Conventions\n\nUne règle par section.",
      parent_page_id: guide,
    });
    expect(ok).toBe(true);
    expect(payload.parent_page_id).toBe(guide);
    // Le titre explicite est vide : l'en-tête du markdown remonte alors en
    // titre, et son émoji en icône (la règle de la projection).
    expect(payload.title).toBe("Conventions");
    expect(payload.icon).toBe("📘");

    const read = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: payload.page_id,
    });
    expect(read.payload.markdown).toBe("Une règle par section.");
  });

  it("refuse un parent qui n'existe pas plutôt que de créer une page invisible", async () => {
    const { ok, payload } = await call("minddy_create_page", {
      project_id: PROJECT,
      title: "Orpheline",
      markdown: "rien",
      parent_page_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(ok).toBe(false);
    expect((payload.error as { code: string }).code).toBe("parent_not_found");
  });
});

describe("minddy_append_to_page", () => {
  it("ajoute un bloc en fin de page sans toucher au reste", async () => {
    const page = await createPage("Journal", "## Lundi\n\nRien à signaler.");

    const { ok } = await call("minddy_append_to_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "## Mardi\n\nLes outils de page arrivent.",
    });
    expect(ok).toBe(true);

    const { payload } = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(payload.markdown).toBe(
      "## Lundi\n\nRien à signaler.\n\n## Mardi\n\nLes outils de page arrivent."
    );
    // Le corps a changé : la version compte les écritures du corps (MIN-271).
    expect(payload.version).toBe(2);
  });

  it("écrit dans une page vide sans coller un séparateur devant", async () => {
    const page = await createPage("Neuve");

    await call("minddy_append_to_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "Le premier paragraphe.",
    });
    const { payload } = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(payload.markdown).toBe("Le premier paragraphe.");
  });
});

describe("minddy_edit_page_text", () => {
  it("réécrit un passage et laisse le reste au caractère près", async () => {
    const body = [
      "## Contexte",
      "",
      "On garde tiptap.",
      "",
      "## Suite",
      "",
      "À décider.",
    ].join("\n");
    const page = await createPage("Architecture", body);

    const { ok, payload } = await call("minddy_edit_page_text", {
      project_id: PROJECT,
      page_id: page,
      old_string: "On garde tiptap.",
      new_string: "On garde tiptap, et Plate reste hors de portée.",
    });
    expect(ok, JSON.stringify(payload)).toBe(true);
    expect(payload.additions).toBe(1);
    expect(payload.deletions).toBe(1);
    expect(payload.diff).toContain("Plate reste hors de portée");

    const read = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(read.payload.markdown).toBe(
      body.replace("On garde tiptap.", "On garde tiptap, et Plate reste hors de portée.")
    );
  });

  it("échoue proprement quand old_string apparaît deux fois", async () => {
    const page = await createPage("Notes", "à faire\n\nà faire");

    const { ok, payload } = await call("minddy_edit_page_text", {
      project_id: PROJECT,
      page_id: page,
      old_string: "à faire",
      new_string: "fait",
    });
    expect(ok).toBe(false);
    const error = payload.error as { code: string; message: string };
    expect(error.code).toBe("text_ambiguous");
    expect(error.message).toMatch(/replace_all/);

    // Et rien n'a été écrit : un refus n'écrit pas la moitié du document.
    const read = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(read.payload.markdown).toBe("à faire\n\nà faire");
    expect(read.payload.version).toBe(1);
  });

  it("renvoie vers minddy_get_page quand old_string est périmé", async () => {
    const page = await createPage("Notes", "le texte de la page");

    const { ok, payload } = await call("minddy_edit_page_text", {
      project_id: PROJECT,
      page_id: page,
      old_string: "un texte que personne n'a écrit",
      new_string: "autre chose",
    });
    expect(ok).toBe(false);
    const error = payload.error as { code: string; message: string };
    expect(error.code).toBe("text_not_found");
    expect(error.message).toContain("minddy_get_page");
  });
});

describe("minddy_update_page", () => {
  it("remplace le corps entier et incrémente la version", async () => {
    const page = await createPage("Guide", "ancien corps");

    const { ok, payload } = await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "## Neuf\n\nTout est réécrit.",
      version: 1,
    });
    expect(ok, JSON.stringify(payload)).toBe(true);
    expect(payload.version).toBe(2);

    const read = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(read.payload.markdown).toBe("## Neuf\n\nTout est réécrit.");
  });

  it("refuse l'écriture sur une version périmée plutôt que d'écraser", async () => {
    const page = await createPage("Guide", "le corps d'origine");
    // Quelqu'un d'autre écrit entre-temps (un humain dans l'éditeur, un autre
    // agent) : la version en base n'est plus celle que l'agent a lue.
    await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "le corps de quelqu'un d'autre",
      version: 1,
    });

    const { ok, payload } = await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "ce que l'agent croyait écrire",
      version: 1,
    });
    expect(ok).toBe(false);
    expect((payload.error as { code: string }).code).toBe("page_stale");

    const read = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(read.payload.markdown).toBe("le corps de quelqu'un d'autre");
  });

  it("renomme sans toucher au corps, et sans rien exiger de plus", async () => {
    const page = await createPage("Guide", "le corps");

    const { ok } = await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      title: "Guide de démarrage",
      icon: "🚀",
    });
    expect(ok).toBe(true);

    const { payload } = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(payload.title).toBe("Guide de démarrage");
    expect(payload.icon).toBe("🚀");
    expect(payload.markdown).toBe("le corps");
    // Renommer n'est pas écrire le corps : la version ne bouge pas.
    expect(payload.version).toBe(1);
  });


  // Le piège qui ne se voit qu'au DEUXIÈME aller-retour : un bloc titre de
  // niveau 1 est un bloc de page légitime, donc `minddy_get_page` rend des corps
  // qui commencent par « # ». Les renvoyer tels quels ne doit pas faire remonter
  // cette ligne dans le titre de la page.
  it("garde un « # » de tête dans le corps quand on renvoie ce qu'on a lu", async () => {
    const page = await createPage("Guide", "## Une section");

    await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: "# Un titre de bloc\n\ndu texte",
      version: 1,
    });

    const first = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(first.payload.title).toBe("Guide");
    expect(first.payload.markdown).toBe("# Un titre de bloc\n\ndu texte");

    // Et le tour d'après, à l'identique : lire puis réécrire ne dérive pas.
    await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
      markdown: first.payload.markdown,
      version: first.payload.version,
    });
    const second = await call("minddy_get_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(second.payload.title).toBe("Guide");
    expect(second.payload.markdown).toBe("# Un titre de bloc\n\ndu texte");
  });

  it("refuse un appel qui ne change rien", async () => {
    const page = await createPage("Guide", "le corps");
    const { ok, payload } = await call("minddy_update_page", {
      project_id: PROJECT,
      page_id: page,
    });
    expect(ok).toBe(false);
    expect((payload.error as { code: string }).code).toBe("invalid_params");
  });
});
