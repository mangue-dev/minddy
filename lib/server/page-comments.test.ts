import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-282 — what the core thread of a page decides, and nothing else catches up.
 *
 * Three things are at play here, and all three are invisible in normal use:
 *
 * - WHO is warned, and only once. A quote already says it all: receive
 * "you have been quoted" AND "we have commented on your page" for the same message,
 * it's two lines for a single gesture, and that's how an inbox stops
 * from being read.
 * - A RESPONSE inherits the anchor of its thread. Without this rule, answering from
 * a composer who knows the current selection would anchor the answer to a
 * OTHER block than the question — a thread that speaks of two places.
 * - A TRASHED page is no longer commented out, and the refusal is a 404: the same
 * signal as invisibility RLS, never “it exists but…”.
 */

const H = vi.hoisted(() => ({
  insertNotifications: vi.fn<
    (service: unknown, rows: Array<Record<string, unknown>>) => Promise<void>
  >(async () => {}),
  access: vi.fn(async () => ({ role: "member" }) as unknown),
  page: { project_id: "p1", created_by: "u-author" } as Record<
    string,
    unknown
  > | null,
  parent: null as Record<string, unknown> | null,
  inserted: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: H.insertNotifications,
  projectMemberIds: async () =>
    new Set(["u-author", "u-bob", "u-clement", "u-dana"]),
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => H.access(...(args as [])),
}));

/**
 * A disposable customer service: two tables, and nothing else to set up. We ONLY care about what comes out of the process (the base) — the same boundary as the
 * other server surface tests.
 */
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table === "pages") {
        return {
          select: () => ({
            is: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: H.page }) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: H.parent }) }),
        }),
        insert(row: Record<string, unknown>) {
          H.inserted = row;
          return {
            select: () => ({
              single: async () => ({
                data: { id: "new-comment", ...row },
                error: null,
              }),
            }),
          };
        },
      };
    },
  }),
}));

const { addPageComment } = await import("./page-comments");

const rows = () => H.insertNotifications.mock.calls[0]?.[1] ?? [];

beforeEach(() => {
  H.insertNotifications.mockClear();
  H.access.mockClear();
  H.page = { project_id: "p1", created_by: "u-author" };
  H.parent = null;
  H.inserted = null;
});

describe("addPageComment", () => {
  it("ancre le commentaire au bloc, avec son extrait figé", async () => {
    const result = await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "cette phrase est fausse",
      blockId: "b1",
      quote: "  la  phrase\n  en question ",
    });
    expect(result.ok).toBe(true);
    expect(H.inserted).toMatchObject({
      page_id: "page-1",
      project_id: "p1",
      block_id: "b1",
      // Folded onto one line: the extract is stored, not copied as is.
      quote: "la phrase en question",
      author_id: "u-clement",
      parent_id: null,
    });
  });

  it("prévient l'auteur de la page, une fois, du bon type", async () => {
    await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "une objection",
    });
    expect(rows()).toEqual([
      {
        user_id: "u-author",
        project_id: "p1",
        type: "page_comment",
        issue_id: null,
        page_id: "page-1",
        block_id: null,
        actor_id: "u-clement",
      },
    ]);
  });

  it("une CITATION suffit : jamais deux lignes pour le même message", async () => {
    // The author of the page is also the one cited. He must receive the
    // mention, and it alone.
    await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "@Author tu es d'accord ?",
      mentionedUserIds: ["u-author"],
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      user_id: "u-author",
      type: "page_mention",
    });
  });

  it("ne se prévient pas soi-même, ni un non-membre", async () => {
    H.page = { project_id: "p1", created_by: "u-clement" };
    await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "note pour moi @Parti",
      mentionedUserIds: ["u-clement", "u-parti"],
    });
    expect(H.insertNotifications).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("une RÉPONSE hérite de l'ancre de son fil, et prévient son auteur", async () => {
    H.parent = {
      id: "root-1",
      parent_id: null,
      page_id: "page-1",
      author_id: "u-bob",
      block_id: "b1",
    };
    await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "d'accord avec toi",
      // A DIFFERENT anchor, such as a composer might carry: it
      // should be ignored, otherwise the thread would talk about two places.
      blockId: "b-ailleurs",
      parentId: "root-1",
    });
    expect(H.inserted).toMatchObject({
      parent_id: "root-1",
      block_id: "b1",
      // The extract lives on the root: a response does not re-quote the passage.
      quote: null,
    });
    expect(rows().map((r) => r.user_id)).toEqual(["u-bob", "u-author"]);
  });

  it("refuse une réponse à un fil d'une AUTRE page", async () => {
    H.parent = {
      id: "root-1",
      parent_id: null,
      page_id: "page-voisine",
      author_id: "u-bob",
      block_id: null,
    };
    const result = await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "…",
      parentId: "root-1",
    });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "commentNotFound" });
  });

  it("refuse un commentaire vide, avant toute écriture", async () => {
    const result = await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "   ",
    });
    expect(result).toMatchObject({ ok: false, status: 400, errorKey: "commentEmpty" });
    expect(H.inserted).toBeNull();
  });

  it("une page CORBEILLÉE ne se commente plus — et répond 404", async () => {
    H.page = null;
    const result = await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "trop tard",
    });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "pageNotFound" });
    expect(H.insertNotifications).not.toHaveBeenCalled();
  });

  it("une page d'un projet qu'on ne voit pas répond 404, pas 403", async () => {
    H.access.mockResolvedValueOnce(null);
    const result = await addPageComment({
      pageId: "page-1",
      actorId: "u-intrus",
      body: "…",
    });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "pageNotFound" });
  });

  it("l'écriture d'un agent MCP porte sa clé — c'est ELLE que le fil nomme", async () => {
    await addPageComment({
      pageId: "page-1",
      actorId: "u-clement",
      body: "vu, je corrige",
      mcpKeyId: "key-1",
    });
    expect(H.inserted).toMatchObject({ via_mcp: true, api_key_id: "key-1" });
    expect(rows()[0]).toMatchObject({ via_mcp: true, api_key_id: "key-1" });
  });
});
