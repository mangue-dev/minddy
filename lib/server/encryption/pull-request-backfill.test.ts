import { beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./store";

type Row = { id: string; url: string | null; title: string | null;
  head_branch: string | null; base_branch: string | null;
  url_encryption_attempted_at: number | null;
  url_encryption_checked_at: number | null;
  content_encryption_attempted_at: number | null;
  content_encryption_checked_at: number | null };
const state = vi.hoisted(() => ({
  rows: [] as Row[], tick: 0, root: 7, version: 1, missingOld: false,
  conflictNext: false, orderColumn: "url_encryption_attempted_at" as
    "url_encryption_attempted_at" | "content_encryption_attempted_at",
}));
const store = new EncryptedStore({
  current: async () => ({ version: state.version, bytes: Buffer.alloc(32, state.root) }),
  byVersion: async (_scope, version) => {
    if (state.missingOld && version < state.version) throw new Error("Historical key unavailable");
    return { version, bytes: Buffer.alloc(32, state.root) };
  },
});
vi.mock("./registry", () => ({
  getEncryptedStore: () => store,
  getContentKeys: () => ({ current: async () => ({
    version: state.version, bytes: Buffer.alloc(32, state.root),
  }) }),
}));
vi.mock("./audit", () => ({ auditDecryption: vi.fn() }));
const query = {
  select: () => query,
  not: () => query,
  or: () => query,
  order: (column: string) => {
    if (column === "url_encryption_attempted_at" ||
        column === "content_encryption_attempted_at") state.orderColumn = column;
    return query;
  },
  limit: async (limit: number) => ({ data: state.rows
    .toSorted((a, b) => (a[state.orderColumn] ?? -1) -
      (b[state.orderColumn] ?? -1) || a.id.localeCompare(b.id))
    .slice(0, limit), error: null }),
};
const service = {
  from: () => query,
  rpc: async (name: string, args: Record<string, unknown>) => {
    const row = state.rows.find((item) => item.id === args.p_id);
    if (!row) return { data: false, error: null };
    if (state.conflictNext) {
      state.conflictNext = false;
      if (name === "migrate_pull_request_url") row.url_encryption_attempted_at = ++state.tick;
      else row.content_encryption_attempted_at = ++state.tick;
      return { data: false, error: null };
    }
    if (name === "migrate_pull_request_url") {
      if (row.url !== args.p_old_url) return { data: false, error: null };
      row.url_encryption_attempted_at = ++state.tick;
      if (typeof args.p_new_url === "string") row.url = args.p_new_url;
      if (args.p_new_url || args.p_verified) row.url_encryption_checked_at = state.tick;
      return { data: true, error: null };
    }
    if (name === "migrate_pull_request_content") {
      if (row.title !== args.p_old_title || row.head_branch !== args.p_old_head ||
          row.base_branch !== args.p_old_base) return { data: false, error: null };
      row.content_encryption_attempted_at = ++state.tick;
      for (const [column, param] of [["title", "p_new_title"],
        ["head_branch", "p_new_head"], ["base_branch", "p_new_base"]] as const) {
        if (typeof args[param] === "string") row[column] = args[param];
      }
      if (args.p_new_title || args.p_new_head || args.p_new_base || args.p_verified) {
        row.content_encryption_checked_at = state.tick;
      }
      return { data: true, error: null };
    }
    return { data: null, error: { code: "unexpected_rpc" } };
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { encodePullRequestUrl } = await import("@/lib/server/agent/pull-request-url-content");
const { encodePullRequestContent } = await import("@/lib/server/agent/pull-request-content");
const { backfillPullRequestUrlsBatch } = await import("./pull-request-url-backfill");
const { backfillPullRequestContentBatch } = await import("./pull-request-content-backfill");

function row(id: string): Row {
  return { id, url: null, title: null, head_branch: null, base_branch: null,
    url_encryption_attempted_at: null, url_encryption_checked_at: null,
    content_encryption_attempted_at: null, content_encryption_checked_at: null };
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_PULL_REQUEST_URL_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_PULL_REQUEST_CONTENT_ENCRYPTION_ENABLED", "true");
  state.rows = [];
  state.tick = 0;
  state.root = 7;
  state.version = 1;
  state.missingOld = false;
  state.conflictNext = false;
  state.orderColumn = "url_encryption_attempted_at";
});

describe("pull request migration verification and retries", () => {
  it("does not check a current URL under the wrong root and advances to another row", async () => {
    const first = row("a"), second = row("b");
    first.url = await encodePullRequestUrl(first.id, "https://private.invalid/a");
    second.url = "https://private.invalid/b";
    state.root = 8;
    state.rows = [first, second];
    expect(await backfillPullRequestUrlsBatch(1)).toMatchObject({ failed: 1, unchanged: 0 });
    expect(first.url_encryption_checked_at).toBeNull();
    expect(first.url_encryption_attempted_at).not.toBeNull();
    expect(await backfillPullRequestUrlsBatch(1)).toMatchObject({ migrated: 1 });
    expect(second.url_encryption_checked_at).not.toBeNull();
  });

  it("does not check current PR content under the wrong root", async () => {
    const first = row("a");
    first.title = await encodePullRequestContent(first.id, "title", "Private title");
    state.root = 8;
    state.rows = [first];
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ failed: 1, unchanged: 0 });
    expect(first.content_encryption_checked_at).toBeNull();
    expect(first.content_encryption_attempted_at).not.toBeNull();
    state.root = 7;
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ unchanged: 1, failed: 0 });
    expect(first.content_encryption_checked_at).not.toBeNull();
  });

  it("rejects a format-current URL with a corrupted authentication tag", async () => {
    const first = row("a");
    const valid = await encodePullRequestUrl(first.id, "https://private.invalid/a");
    const parts = valid.split(":");
    const envelope = JSON.parse(Buffer.from(parts[2], "base64url").toString("utf8"));
    envelope.tag = (envelope.tag[0] === "A" ? "B" : "A") + envelope.tag.slice(1);
    first.url = `${parts[0]}:${parts[1]}:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
    state.rows = [first];
    expect(await backfillPullRequestUrlsBatch(1)).toMatchObject({ failed: 1, unchanged: 0 });
    expect(first.url_encryption_checked_at).toBeNull();
  });

  it("rejects a format-current PR title with a corrupted authentication tag", async () => {
    const first = row("a");
    const valid = await encodePullRequestContent(first.id, "title", "Private title");
    const parts = valid.split(":");
    const envelope = JSON.parse(Buffer.from(parts[2], "base64url").toString("utf8"));
    envelope.tag = (envelope.tag[0] === "A" ? "B" : "A") + envelope.tag.slice(1);
    first.title = `${parts[0]}:${parts[1]}:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
    state.rows = [first];
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ failed: 1, unchanged: 0 });
    expect(first.content_encryption_checked_at).toBeNull();
  });

  it("retries when a historical content key becomes available", async () => {
    const first = row("a");
    first.title = await encodePullRequestContent(first.id, "title", "Private title");
    state.version = 2;
    state.missingOld = true;
    state.rows = [first];
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ failed: 1 });
    expect(first.content_encryption_checked_at).toBeNull();
    state.missingOld = false;
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ migrated: 1 });
    expect(first.content_encryption_checked_at).not.toBeNull();
  });

  it("retries a historical URL after its key is restored", async () => {
    const first = row("a");
    first.url = await encodePullRequestUrl(first.id, "https://private.invalid/a");
    state.version = 2;
    state.missingOld = true;
    state.rows = [first];
    expect(await backfillPullRequestUrlsBatch(1)).toMatchObject({ failed: 1 });
    expect(first.url_encryption_checked_at).toBeNull();
    state.missingOld = false;
    expect(await backfillPullRequestUrlsBatch(1)).toMatchObject({ migrated: 1 });
    expect(first.url_encryption_checked_at).not.toBeNull();
  });

  it("moves a repeatedly conflicting row behind other PR content", async () => {
    const first = row("a"), second = row("b");
    first.title = "Private first title";
    second.title = "Private second title";
    state.rows = [first, second];
    state.conflictNext = true;
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ conflicted: 1 });
    expect(first.content_encryption_attempted_at).not.toBeNull();
    expect(await backfillPullRequestContentBatch(1)).toMatchObject({ migrated: 1 });
    expect(second.content_encryption_checked_at).not.toBeNull();
  });
});
