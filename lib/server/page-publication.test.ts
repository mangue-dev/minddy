import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-283 — what a published page lets you see, and especially what it doesn't let
 * see.
 *
 * Each case below is a leak that we refuse, not a preference:
 *
 * - an unknown token, or an unpublished page, responds NOTHING (404);
 * - without `include_children`, the title of a subpage does not come out of the server —
 * “2027 price specification” crossed out in a block is already a leak;
 * - a page outside the published branch cannot be reached by its id ;
 * - a file whose page is not published loses its address: the bucket
 * remains private, and the application URL would say the project and the identifier.
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

/** A fake service client: just enough PostgREST for these reads.
 Request object is THENABLE — `await service.from(…).select(…)` returns the
 list, `maybeSingle()` returns the row. This is exactly the form that the code
 calls for. */
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

// UUIDs for the project and files: the address of a page file is
// recognized by its FORM (lib/page-files.ts), and a tinkered id would not be one.
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
    // The breadcrumbs stop at the published page, never above.
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
    // The page of this file is not published: no more address at all, and
    // especially not the application URL, which names the project and the file.
    expect(json).not.toContain(FILE_HORS);
    expect(json).not.toContain("/api/projects/");
  });
});
