import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-283 — publier, re-régler, dépublier. Les gardes d'abord :
 *
 *  - une page qu'on ne peut pas voir répond « introuvable », jamais « interdit » ;
 *  - une page à la corbeille ne se publie pas ;
 *  - « mot de passe » sans mot de passe est refusé plutôt que créé ouvert ;
 *  - le TOKEN survit à un changement de réglage : un lien déjà envoyé à un
 *    client ne doit pas mourir parce qu'on a coché « inclure les sous-pages ».
 */

interface Row {
  [key: string]: unknown;
}

const db = {
  page: { id: "page-1", project_id: "proj" } as Row | null,
  share: null as Row | null,
};
let access: unknown = { isOwner: true };
const writes: Array<{ kind: "insert" | "update"; values: Row }> = [];

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => access,
}));
vi.mock("@/lib/server/custom-domains", () => ({
  getDomainForShare: async () => null,
  detachDomainFromVercelOnly: async () => {},
}));

function table(name: string) {
  const api = {
    select: () => api,
    eq: () => api,
    is: () => api,
    maybeSingle: async () => ({
      data: name === "pages" ? db.page : db.share,
      error: null,
    }),
    insert: async (values: Row) => {
      writes.push({ kind: "insert", values });
      db.share = { ...values, id: "share-1" };
      return { error: null };
    },
    update: (values: Row) => {
      writes.push({ kind: "update", values });
      db.share = { ...(db.share ?? {}), ...values };
      return { eq: async () => ({ error: null }) };
    },
    delete: () => ({
      eq: async () => {
        db.share = null;
        return { error: null };
      },
    }),
  };
  return api;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (name: string) => table(name) }),
}));

const { deletePageShare, getPageShare, upsertPageShare } = await import(
  "@/lib/server/view-shares"
);

beforeEach(() => {
  db.page = { id: "page-1", project_id: "proj" };
  db.share = null;
  access = { isOwner: true };
  writes.length = 0;
});

describe("upsertPageShare", () => {
  it("refuse une page dont le projet n'est pas le mien — en 404", async () => {
    access = null;
    expect(await upsertPageShare({ pageId: "page-1", actorId: "u", level: "public" })).toEqual(
      { ok: false, status: 404, errorKey: "pageNotFound" }
    );
    expect(writes).toHaveLength(0);
  });

  it("refuse une page qui n'existe pas (ou qui est à la corbeille)", async () => {
    db.page = null;
    expect(await getPageShare("page-1", "u")).toEqual({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
  });

  it("exige un mot de passe pour un partage protégé qui n'en a pas encore", async () => {
    expect(
      await upsertPageShare({ pageId: "page-1", actorId: "u", level: "password" })
    ).toEqual({ ok: false, status: 400, errorKey: "passwordRequired" });
    expect(writes).toHaveLength(0);
  });

  it("publie la page seule par défaut : la branche ne suit pas", async () => {
    const result = await upsertPageShare({
      pageId: "page-1",
      actorId: "u",
      level: "public",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.share) return;
    expect(result.share.include_children).toBe(false);
    expect(result.share.token).toHaveLength(22);
  });

  it("garde le token quand on change un réglage", async () => {
    const first = await upsertPageShare({
      pageId: "page-1",
      actorId: "u",
      level: "public",
    });
    const token = first.ok && first.share ? first.share.token : null;
    const second = await upsertPageShare({
      pageId: "page-1",
      actorId: "u",
      level: "public",
      includeChildren: true,
    });
    expect(second.ok && second.share?.token).toBe(token);
    expect(second.ok && second.share?.include_children).toBe(true);
  });
});

describe("deletePageShare", () => {
  it("dépublie, et le lien cesse de répondre", async () => {
    await upsertPageShare({ pageId: "page-1", actorId: "u", level: "public" });
    expect(await deletePageShare("page-1", "u")).toEqual({ ok: true, share: null });
    expect(await getPageShare("page-1", "u")).toEqual({ ok: true, share: null });
  });
});
