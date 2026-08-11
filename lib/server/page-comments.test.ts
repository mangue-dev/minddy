import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-282 — ce que le noyau du fil d'une page décide, et que rien d'autre ne
 * rattrape.
 *
 * Trois choses s'y jouent, et les trois sont invisibles à l'usage normal :
 *
 *  - QUI est prévenu, et une seule fois. Une citation dit déjà tout : recevoir
 *    « on vous a cité » ET « on a commenté votre page » pour le même message,
 *    c'est deux lignes pour un seul geste, et c'est comme ça qu'une inbox cesse
 *    d'être lue.
 *  - Une RÉPONSE hérite de l'ancre de son fil. Sans cette règle, répondre depuis
 *    un composeur qui connaît la sélection courante ancrerait la réponse sur un
 *    AUTRE bloc que la question — un fil qui parle de deux endroits.
 *  - Une page CORBEILLÉE ne se commente plus, et le refus est un 404 : le même
 *    signal que l'invisibilité RLS, jamais « elle existe mais… ».
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
 * Un client service jetable : deux tables, et rien d'autre à monter. On ne se
 * moque QUE de ce qui sort du process (la base) — la même frontière que les
 * autres tests de surface serveur.
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

const { addPageComment, resolvePageThread } = await import("./page-comments");

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
      // Replié sur une ligne : l'extrait est rangé, pas recopié tel quel.
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
    // L'auteur de la page est aussi celui qu'on cite. Il doit recevoir la
    // mention, et elle seule.
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
      // Une ancre DIFFÉRENTE, telle qu'un composeur pourrait la porter : elle
      // doit être ignorée, sinon le fil parlerait de deux endroits.
      blockId: "b-ailleurs",
      parentId: "root-1",
    });
    expect(H.inserted).toMatchObject({
      parent_id: "root-1",
      block_id: "b1",
      // L'extrait vit sur la racine : une réponse ne re-cite pas le passage.
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

/**
 * La RÉSOLUTION vit sur la racine du fil, et sur elle seule — un fil se clôt
 * entier. Le geste part pourtant de n'importe quel message : cliquer « résoudre »
 * sous une réponse, c'est le même geste vu d'ailleurs, pas une erreur à refuser.
 */
describe("resolvePageThread", () => {
  const client = (row: Record<string, unknown> | null) => {
    const updated: { id?: unknown; patch?: Record<string, unknown> } = {};
    return {
      seen: updated,
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          }),
          update(patch: Record<string, unknown>) {
            updated.patch = patch;
            return {
              eq: (_col: string, value: unknown) => {
                updated.id = value;
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { id: value, ...patch },
                      error: null,
                    }),
                  }),
                };
              },
            };
          },
        }),
      },
    };
  };

  it("remonte à la racine quand on résout depuis une réponse", async () => {
    const fake = client({ id: "reply-1", parent_id: "root-1" });
    const result = await resolvePageThread(fake.client as never, {
      commentId: "reply-1",
      actorId: "u-clement",
      resolved: true,
    });
    expect(result.ok).toBe(true);
    expect(fake.seen.id).toBe("root-1");
    expect(fake.seen.patch).toMatchObject({ resolved_by: "u-clement" });
    expect(typeof fake.seen.patch?.resolved_at).toBe("string");
  });

  it("rouvre par le même verbe, et efface qui avait clos", async () => {
    const fake = client({ id: "root-1", parent_id: null });
    await resolvePageThread(fake.client as never, {
      commentId: "root-1",
      actorId: "u-bob",
      resolved: false,
    });
    expect(fake.seen.patch).toEqual({ resolved_at: null, resolved_by: null });
  });

  it("répond 404 sur un fil qu'on ne voit pas — la RLS ne dit rien de plus", async () => {
    const fake = client(null);
    const result = await resolvePageThread(fake.client as never, {
      commentId: "root-1",
      actorId: "u-intrus",
      resolved: true,
    });
    expect(result).toMatchObject({ ok: false, status: 404, errorKey: "commentNotFound" });
  });
});
