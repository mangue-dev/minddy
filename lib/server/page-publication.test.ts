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
  pageReads: [] as Array<{ columns: string; filters: Row }>,
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
  let columns = "";
  const recordRead = () => {
    if (name === "pages") db.pageReads.push({ columns, filters: { ...filters } });
  };
  const api = {
    select: (selected: string) => {
      columns = selected;
      return api;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return api;
    },
    in: (_column: string, values: unknown[]) => {
      ins = values;
      return api;
    },
    is: (column: string, value: unknown) => {
      filters[column] = value;
      return api;
    },
    order: () => api,
    maybeSingle: async () => {
      recordRead();
      return { data: single(name, filters) };
    },
    then: (resolve: (value: { data: unknown; error: null }) => void) => {
      recordRead();
      resolve({ data: many(name, filters, ins), error: null });
    },
  };
  return api;
}

function single(name: string, filters: Record<string, unknown>): Row | null {
  if (name === "view_shares") {
    return db.share && db.share.token === filters.token ? db.share : null;
  }
  if (name === "pages") {
    return db.pages.find((p) => Object.entries(filters).every(
      ([column, value]) => (p[column] ?? null) === value,
    )) ?? null;
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
  db.pageReads = [];
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


describe("published page databases", () => {
  it.each([false, true])(
    "preserves a shared entry's properties without exposing its parent or siblings (include_children=%s)",
    async (includeChildren) => {
      db.share = share({ page_id: "kid", include_children: includeChildren });
      db.pages[0].title = "Private parent title";
      db.pages[0].database_schema = [
        { id: "notes", name: "Summary", type: "text" },
        { id: "checked", name: "Approved", type: "checkbox" },
      ];
      db.pages[1].property_values = { notes: "Release scope agreed", checked: true };
      db.pages[1].content = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Entry body" }] }],
      };
      db.pages.push({
        ...page("sibling", "root", "Private sibling title"),
        property_values: { notes: "Private sibling value" },
      });

      const bundle = await getPublicPageBundle("tok");
      const json = JSON.stringify(bundle);
      expect(json).toContain("Summary: Release scope agreed");
      expect(json).toContain("Approved: ☑");
      expect(json).toContain("Entry body");
      expect(bundle?.pages.map((entry) => entry.id)).toEqual(["kid"]);
      expect(bundle?.trail).toEqual([]);
      expect(json).not.toContain("Private parent title");
      expect(json).not.toContain("Private sibling title");
      expect(json).not.toContain("Private sibling value");
      expect(json).not.toContain("/p/tok/root");
      expect(json).not.toContain("/p/tok/sibling");
      expect(db.pageReads.filter((read) => read.filters.id === "root")).toEqual([
        {
          columns: "id, database_schema",
          filters: { id: "root", project_id: PROJECT, deleted_at: null },
        },
      ]);
      if (!includeChildren) {
        expect(db.pageReads.every((read) => ["kid", "root"].includes(read.filters.id as string))).toBe(true);
      }
      expect(await getPublicPageBundle("tok", "root")).toBeNull();
      expect(await getPublicPageBundle("tok", "sibling")).toBeNull();
    },
  );

  it.each([
    { database_schema: null },
    { deleted_at: "2026-08-12T00:00:00Z" },
    { project_id: "another-project" },
  ])("keeps the entry body when its parent schema is unavailable (%j)", async (parentOverrides) => {
    db.share = share({ page_id: "kid" });
    Object.assign(db.pages[0], {
      database_schema: [{ id: "notes", name: "Summary", type: "text" }],
      ...parentOverrides,
    });
    db.pages[1].property_values = { notes: "Unprojected value" };
    db.pages[1].content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Entry body" }] }],
    };
    const bundle = await getPublicPageBundle("tok");
    expect(bundle?.content).toEqual(db.pages[1].content);
    expect(bundle?.pages.map((entry) => entry.id)).toEqual(["kid"]);
  });

  it("keeps the published root schema when rendering an entry", async () => {
    db.share = share({ include_children: true });
    db.pages[0].database_schema = [{ id: "notes", name: "Summary", type: "text" }];
    db.pages[1].property_values = { notes: "Release scope agreed" };
    const entry = await getPublicPageBundle("tok", "kid");
    expect(JSON.stringify(entry?.content)).toContain("Summary: Release scope agreed");
    const database = await getPublicPageBundle("tok");
    expect(JSON.stringify(database?.content)).toContain("Summary: Release scope agreed");
    expect(JSON.stringify(database?.content)).toContain("/p/tok/kid");
    expect(database?.pages[0]).not.toHaveProperty("database_schema");
  });

  it("does not expose entry values when publishing only the database", async () => {
    db.pages[0].database_schema = [{ id: "notes", name: "Summary", type: "text" }];
    db.pages[1].property_values = { notes: "Private entry value" };
    const database = await getPublicPageBundle("tok");
    expect(database?.content).toEqual({ type: "doc", content: [] });
    expect(JSON.stringify(database)).not.toContain("Private entry value");
  });
});
