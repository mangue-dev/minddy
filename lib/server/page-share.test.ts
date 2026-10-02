import { beforeEach, describe, expect, it, vi } from "vitest";

import { MIN_SHARE_PASSWORD_LENGTH } from "@/lib/share-password";

/**
 * MIN-283 — publish, re-set, unpublish. The guards first:
 *
 * - a page that cannot be seen responds "not found", never "forbidden";
 * - a page in the trash is not published;
 * - "password" without a password is refused rather than created open;
 * - the TOKEN survives a change of setting: a link already sent to a
 * client must not die because “include subpages” was checked.
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
const encryption = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/lib/server/encryption/share-token-content", () => ({
  shouldProtectShareTokens: async () => encryption.enabled,
  encodeShareToken: async (id: string, token: string) =>
    `mdys3:1:${Buffer.from(`${id}:${token}`).toString("base64url")}`,
  decodeShareToken: async (_id: string, stored: string) => stored.startsWith("mdys3:")
    ? Buffer.from(stored.split(":")[2], "base64url").toString("utf8").split(":")[1]
    : stored,
  shareTokenLookup: async (token: string) =>
    Buffer.from(token).toString("hex").padStart(64, "0"),
}));

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
      db.share = { ...db.share, ...values };
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
  encryption.enabled = false;
});

describe("upsertPageShare", () => {
  it("rejects a page whose project is not mine — with 404", async () => {
    access = null;
    expect(await upsertPageShare({ pageId: "page-1", actorId: "u", level: "public" })).toEqual(
      { ok: false, status: 404, errorKey: "pageNotFound" }
    );
    expect(writes).toHaveLength(0);
  });

  it("rejects a page that does not exist (or is in the trash)", async () => {
    db.page = null;
    expect(await getPageShare("page-1", "u")).toEqual({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
  });

  it("requires a password for a protected share that does not have one yet", async () => {
    expect(
      await upsertPageShare({ pageId: "page-1", actorId: "u", level: "password" })
    ).toEqual({ ok: false, status: 400, errorKey: "passwordRequired" });
    expect(writes).toHaveLength(0);
  });

  it("rejects a password that is too short instead of hashing it (MIN-347)", async () => {
    // No minimum length: “a” was an acceptable setting, i.e.
    // a sharing announced as protected and de facto open.
    expect(
      await upsertPageShare({
        pageId: "page-1",
        actorId: "u",
        level: "password",
        password: "a".repeat(MIN_SHARE_PASSWORD_LENGTH - 1),
      })
    ).toEqual({ ok: false, status: 400, errorKey: "passwordTooShort" });
    expect(writes).toHaveLength(0);

    const ok = await upsertPageShare({
      pageId: "page-1",
      actorId: "u",
      level: "password",
      password: "a".repeat(MIN_SHARE_PASSWORD_LENGTH),
    });
    expect(ok.ok).toBe(true);
  });

  it("shows the same length on screen as it requires", async () => {
    // The number is spelled out in messages (a placeholder called
    // without its values ​​would display the path of its key): it is this test which
    // holds the two together.
    const [en, fr] = await Promise.all([
      import("@/messages/en.json"),
      import("@/messages/fr.json"),
    ]);
    for (const messages of [en.default, fr.default]) {
      expect(messages.ApiErrors.passwordTooShort).toContain(
        String(MIN_SHARE_PASSWORD_LENGTH)
      );
      expect(messages.ShareView.passwordMinHint).toContain(
        String(MIN_SHARE_PASSWORD_LENGTH)
      );
      expect(messages.PublishPage.passwordMinHint).toContain(
        String(MIN_SHARE_PASSWORD_LENGTH)
      );
    }
  });

  it("publishes only the page by default: the branch does not follow", async () => {
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

  it("keeps the token when a setting changes", async () => {
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

  it("stores an encrypted token and returns the URL token to its owner", async () => {
    encryption.enabled = true;
    const first = await upsertPageShare({ pageId: "page-1", actorId: "u",
      level: "public" });
    expect(first.ok).toBe(true);
    if (!first.ok || !first.share) return;
    expect(db.share?.token).toMatch(/^mdys3:1:/);
    expect(JSON.stringify(db.share)).not.toContain(first.share.token);
    expect(db.share?.token_lookup).toBeTruthy();
    const ownerRead = await getPageShare("page-1", "u");
    expect(ownerRead.ok && ownerRead.share?.token).toBe(first.share.token);
    const second = await upsertPageShare({ pageId: "page-1", actorId: "u",
      level: "public", includeChildren: true });
    expect(second.ok && second.share?.token).toBe(first.share.token);
    expect(db.share?.token).toMatch(/^mdys3:1:/);
  });
});

describe("deletePageShare", () => {
  it("unpublishes and the link stops responding", async () => {
    await upsertPageShare({ pageId: "page-1", actorId: "u", level: "public" });
    expect(await deletePageShare("page-1", "u")).toEqual({ ok: true, share: null });
    expect(await getPageShare("page-1", "u")).toEqual({ ok: true, share: null });
  });
});
