import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-283 — ce qu'une page publiée laisse voir, et surtout ce qu'elle ne laisse
 * pas voir.
 *
 * Chaque cas ci-dessous est une fuite qu'on refuse, pas une préférence :
 *
 *  - un token inconnu, ou une page dépubliée, ne répond RIEN (404) ;
 *  - sans `include_children`, le titre d'une sous-page ne sort pas du serveur —
 *    « Spécification tarifs 2027 » barré dans un bloc est déjà une fuite ;
 *  - une page hors de la branche publiée n'est pas atteignable par son id ;
 *  - un fichier dont la page n'est pas publiée perd son adresse : le bucket
 *    reste privé, et l'URL d'application dirait le projet et l'identifiant.
 */

interface Row {
  [key: string]: unknown;
}

const db = {
  share: null as Row | null,
  pages: [] as Row[],
  project: null as Row | null,
  files: [] as Row[],
};

const signed = vi.fn(async (_service: unknown, path: string) => `https://signed/${path}`);

vi.mock("@/lib/server/attachments", () => ({
  signedAttachmentUrl: (...args: unknown[]) =>
    signed(args[0], args[1] as string),
}));

/** Un faux client de service : juste assez de PostgREST pour ces lectures.
    L'objet de requête est THENABLE — `await service.from(…).select(…)` rend la
    liste, `maybeSingle()` rend la ligne. C'est exactement la forme que le code
    appelle. */
function table(name: string) {
  const filters: Record<string, unknown> = {};
  let ins: unknown[] | undefined;
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return api;
    },
    in: (_column: string, values: unknown[]) => {
      ins = values;
      return api;
    },
    is: () => api,
    order: () => api,
    maybeSingle: async () => ({ data: single(name, filters) }),
    then: (resolve: (value: { data: unknown; error: null }) => void) =>
      resolve({ data: many(name, filters, ins), error: null }),
  };
  return api;
}

function single(name: string, filters: Record<string, unknown>): Row | null {
  if (name === "view_shares") {
    return db.share && db.share.token === filters.token ? db.share : null;
  }
  if (name === "pages") {
    return db.pages.find((p) => p.id === filters.id) ?? null;
  }
  if (name === "projects") return db.project;
  return null;
}

function many(name: string, filters: Record<string, unknown>, ins?: unknown[]): Row[] {
  if (name === "pages") {
    return db.pages.filter((p) => p.project_id === filters.project_id);
  }
  if (name === "page_files") {
    return db.files.filter((f) => (ins ?? []).includes(f.id));
  }
  return [];
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => table(name) }),
}));

const { getPublicPageBundle } = await import("@/lib/server/page-publication");

// Des UUID pour le projet et les fichiers : l'adresse d'un fichier de page est
// reconnue à sa FORME (lib/page-files.ts), et un id bricolé n'en serait pas une.
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const FILE_OK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FILE_HORS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function page(id: string, parent: string | null, title: string, content: unknown = null) {
  return {
    id,
    project_id: PROJECT,
    parent_id: parent,
    title,
    icon: null,
    content,
    updated_at: "2026-08-11T00:00:00Z",
    position: "a",
  };
}

function share(overrides: Row = {}): Row {
  return {
    id: "share-1",
    token: "tok",
    level: "public",
    password_salt: null,
    password_hash: null,
    created_by: "owner",
    include_children: false,
    page_id: "root",
    view_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  db.share = share();
  db.project = { id: PROJECT, key: "MIN", name: "Acme", owner_id: "owner" };
  db.files = [];
  db.pages = [
    page("root", null, "Guide", {
      type: "doc",
      content: [{ type: "subpage", attrs: { pageId: "kid" } }],
    }),
    page("kid", "root", "Spécification tarifs 2027"),
  ];
});

describe("getPublicPageBundle", () => {
  it("ne répond rien à un token inconnu", async () => {
    expect(await getPublicPageBundle("inconnu")).toBeNull();
  });

  it("ne répond rien quand la page a été dépubliée", async () => {
    db.share = null;
    expect(await getPublicPageBundle("tok")).toBeNull();
  });

  it("ne laisse pas fuir le titre d'une sous-page non publiée", async () => {
    const bundle = await getPublicPageBundle("tok");
    expect(bundle).not.toBeNull();
    expect(bundle!.pages.map((p) => p.id)).toEqual(["root"]);
    expect(JSON.stringify(bundle)).not.toContain("Spécification tarifs 2027");
  });

  it("refuse une page de la branche tant que la branche n'est pas publiée", async () => {
    expect(await getPublicPageBundle("tok", "kid")).toBeNull();
  });

  it("publie la branche quand include_children est posé", async () => {
    db.share = share({ include_children: true });
    const bundle = await getPublicPageBundle("tok", "kid");
    expect(bundle).not.toBeNull();
    expect(bundle!.page.id).toBe("kid");
    expect(bundle!.pages.map((p) => p.id).sort()).toEqual(["kid", "root"]);
    // Le fil d'Ariane s'arrête à la page publiée, jamais au-dessus.
    expect(bundle!.trail.map((p) => p.id)).toEqual(["root"]);
  });

  it("ne sort jamais d'un projet supprimé", async () => {
    db.project = null;
    expect(await getPublicPageBundle("tok")).toBeNull();
  });

  it("signe les fichiers de la page publiée, et efface les autres", async () => {
    db.files = [
      { id: FILE_OK, page_id: "root", storage_path: `projects/${PROJECT}/pages/root/a.png` },
      { id: FILE_HORS, page_id: "kid", storage_path: `projects/${PROJECT}/pages/kid/b.png` },
    ];
    db.pages[0].content = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: `/api/projects/${PROJECT}/pages/files/${FILE_OK}` },
        },
        {
          type: "image",
          attrs: { src: `/api/projects/${PROJECT}/pages/files/${FILE_HORS}` },
        },
      ],
    };
    const bundle = await getPublicPageBundle("tok");
    const json = JSON.stringify(bundle!.content);
    expect(json).toContain(`https://signed/projects/${PROJECT}/pages/root/a.png`);
    // La page de ce fichier-là n'est pas publiée : plus d'adresse du tout, et
    // surtout pas l'URL d'application, qui nomme le projet et le fichier.
    expect(json).not.toContain(FILE_HORS);
    expect(json).not.toContain("/api/projects/");
  });
});
