import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-account OpenRouter keys (MIN-761). The cap arithmetic is pinned as a pure
 * function; the lifecycle runs against an in-memory `managed_ai_keys` table and
 * a fake OpenRouter account behind `fetch`, so every management request can be
 * inspected (no request may ever disable a key instead of deleting it).
 */

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown> & { key_hash: string };

const { db, billing, usage } = vi.hoisted(() => ({
  db: { rows: [] as Row[] },
  billing: {
    planId: "go",
    includedUsd: 5,
    windowStart: "2026-10-01T00:00:00.000Z",
    windowEnd: "2026-11-01T00:00:00.000Z",
    usedUsd: 0,
  },
  usage: { calls: 0 },
}));

vi.mock("@/lib/server/managed-ai-key-content", () => ({
  encodeManagedAiKey: async (key: string) => `sealed:${key}`,
  decodeManagedAiKey: async (value: string) => value.replace(/^sealed:/, ""),
}));

function resolvedBilling() {
  return {
    planId: billing.planId,
    plan: { id: billing.planId, includedUsageUsd: billing.includedUsd },
  };
}

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => resolvedBilling(),
}));

vi.mock("@/lib/server/usage", () => ({
  getUsagePeriod: async () => ({ start: billing.windowStart, end: billing.windowEnd }),
  getUserUsage: async () => {
    usage.calls += 1;
    return {
      billing: resolvedBilling(),
      period: { start: billing.windowStart, end: "2026-11-01T00:00:00.000Z" },
      usedUsd: billing.usedUsd,
      byFeature: {},
    };
  },
}));

/** Just enough of the PostgREST builder for this module, with its unique indexes. */
function table() {
  const filters: [string, unknown][] = [];
  let action: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | null = null;
  let range: [number, number] | null = null;
  const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);
  const run = async () => {
    // Yield, so that concurrent callers interleave like real requests.
    await Promise.resolve();
    if (action === "insert" && payload) {
      const row = payload;
      const conflict = db.rows.some((existing) =>
        existing.key_hash === row.key_hash ||
        (row.user_id && existing.user_id === row.user_id) ||
        (row.purpose === "public" && existing.purpose === "public"));
      if (conflict) return { data: null, error: { code: "23505", message: "duplicate key" } };
      db.rows.push({ id: `row-${db.rows.length}`, ...row });
      return { data: null, error: null };
    }
    if (action === "update" && payload) {
      const updated = db.rows.filter(matches);
      for (const row of updated) Object.assign(row, payload);
      return { data: updated.map((row) => ({ key_hash: row.key_hash })), error: null };
    }
    if (action === "delete") {
      db.rows = db.rows.filter((row) => !matches(row));
      return { data: null, error: null };
    }
    const found = db.rows.filter(matches);
    return { data: range ? found.slice(range[0], range[1] + 1) : found, error: null };
  };
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    range: (from: number, to: number) => {
      range = [from, to];
      return builder;
    },
    insert: (row: Row) => {
      action = "insert";
      payload = row;
      return builder;
    },
    update: (row: Row) => {
      action = "update";
      payload = row;
      return builder;
    },
    delete: () => {
      action = "delete";
      return builder;
    },
    maybeSingle: async () => {
      const result = await run();
      const rows = result.data as Row[] | null;
      return { data: rows?.[0] ?? null, error: result.error };
    },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      run().then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => table() }),
}));

interface FakeKey {
  hash: string;
  name: string;
  key: string;
  limit: number | null;
  limit_reset: string | null;
  usage: number;
  usage_daily: number;
  created_at: string;
}

const openRouter = {
  keys: new Map<string, FakeKey>(),
  requests: [] as { method: string; path: string; body: Record<string, unknown> | null }[],
  created: 0,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function keyData(key: FakeKey) {
  const { key: _secret, ...data } = key;
  return data;
}

async function fakeOpenRouter(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  const path = url.pathname.replace("/api/v1/keys", "");
  openRouter.requests.push({ method, path, body });
  await Promise.resolve();
  if (method === "POST") {
    openRouter.created += 1;
    const key: FakeKey = {
      hash: `hash-${openRouter.created}`,
      name: String(body?.name),
      key: `sk-or-v1-${openRouter.created}`,
      limit: body?.limit as number,
      limit_reset: (body?.limit_reset as string | null) ?? null,
      usage: 0,
      usage_daily: 0,
      created_at: new Date().toISOString(),
    };
    openRouter.keys.set(key.hash, key);
    return json(201, { data: keyData(key), key: key.key });
  }
  if (method === "GET" && path === "") {
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const page = [...openRouter.keys.values()].slice(offset, offset + 2).map(keyData);
    return json(200, { data: page });
  }
  const key = openRouter.keys.get(decodeURIComponent(path.slice(1)));
  if (!key) return json(404, { error: { message: "Not found" } });
  if (method === "GET") return json(200, { data: keyData(key) });
  if (method === "PATCH") {
    if (typeof body?.limit === "number") key.limit = body.limit;
    return json(200, { data: keyData(key) });
  }
  openRouter.keys.delete(key.hash);
  return json(200, { deleted: true });
}

const managed = await import("./managed-ai-key");
const {
  computeKeyLimit,
  keyNamePrefix,
  startsLaterWindow,
  resolveUserAiKey,
  resolvePublicAiKey,
  reconcileUserAiKey,
  discardManagedAiKey,
  deleteUserAiKey,
  sweepOrphanKeys,
  clearManagedAiKeyCache,
  ManagedAiKeyUnavailableError,
} = managed;

const USER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  db.rows = [];
  Object.assign(billing, {
    planId: "go",
    includedUsd: 5,
    windowStart: "2026-10-01T00:00:00.000Z",
    windowEnd: "2026-11-01T00:00:00.000Z",
    usedUsd: 0,
  });
  usage.calls = 0;
  openRouter.keys.clear();
  openRouter.requests = [];
  openRouter.created = 0;
  clearManagedAiKeyCache();
  vi.stubGlobal("fetch", vi.fn(fakeOpenRouter));
  vi.stubEnv("MINDDY_EDITION", "cloud");
  vi.stubEnv("MINDDY_MANAGED_AI", "1");
  vi.stubEnv("OPENROUTER_API_KEY", "shared-key");
  vi.stubEnv("OPENROUTER_MANAGEMENT_KEY", "management-key");
  vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://preview-ref.supabase.co");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // Every management request deletes a key it no longer wants; none disables one.
  expect(openRouter.requests.some((request) => request.body && "disabled" in request.body)).toBe(false);
});

function storedRow(): Row {
  const row = db.rows.find((candidate) => candidate.user_id === USER);
  if (!row) throw new Error("no row");
  return row;
}

function storedKey(): FakeKey {
  const key = openRouter.keys.get(storedRow().key_hash);
  if (!key) throw new Error("no key");
  return key;
}

describe("computeKeyLimit", () => {
  it("caps a first key at the included usage plus the headroom", () => {
    expect(computeKeyLimit({ keyUsage: 0, baseline: 0, includedUsd: 5, windowChanged: false }))
      .toEqual({ baseline: 0, limit: 5.25 });
  });

  it("restarts from the key's usage when a later window begins", () => {
    expect(computeKeyLimit({ keyUsage: 4.8, baseline: 0, includedUsd: 5, windowChanged: true }))
      .toEqual({ baseline: 4.8, limit: 10.05 });
  });

  it("raises the cap at once on an upgrade, keeping the baseline", () => {
    expect(computeKeyLimit({ keyUsage: 3, baseline: 1, includedUsd: 15, windowChanged: false }))
      .toEqual({ baseline: 1, limit: 16.75 });
  });

  it("blocks at the current usage on a downgrade below what was spent", () => {
    expect(computeKeyLimit({ keyUsage: 4, baseline: 1, includedUsd: 0.5, windowChanged: false }))
      .toEqual({ baseline: 1, limit: 4 });
  });

  it("treats an admin reset like a new window", () => {
    expect(computeKeyLimit({ keyUsage: 2.5, baseline: 0, includedUsd: 0.5, windowChanged: true }))
      .toEqual({ baseline: 2.5, limit: 3.025 });
  });

  it("falls back to the free budget after a cancellation without a fresh window", () => {
    expect(computeKeyLimit({ keyUsage: 0.3, baseline: 0, includedUsd: 0.5, windowChanged: false }))
      .toEqual({ baseline: 0, limit: 0.525 });
  });

  it("applies the headroom to the included usage, never to the baseline", () => {
    const { limit } = computeKeyLimit({ keyUsage: 100, baseline: 100, includedUsd: 10, windowChanged: false });
    expect(limit).toBe(110.5);
  });

  it("subtracts the ledger usage carried in a negative baseline", () => {
    expect(computeKeyLimit({ keyUsage: 0, baseline: -0.2, includedUsd: 5, windowChanged: false }).limit)
      .toBe(5.05);
  });
});

describe("keyNamePrefix", () => {
  it("names keys after the database that references them", () => {
    expect(keyNamePrefix("https://dehkvxlygczjbnbubffn.supabase.co")).toBe("minddy-cloud:dehkvxlygczjbnbubffn:");
    expect(keyNamePrefix("not a url")).toBe("minddy-cloud:default:");
  });
});

describe("startsLaterWindow", () => {
  it("compares instants, not strings", () => {
    expect(startsLaterWindow("2026-10-01T00:00:00+00:00", "2026-10-01T00:00:00.000Z")).toBe(false);
    expect(startsLaterWindow("2026-10-01T00:00:00+00:00", "2026-11-01T00:00:00.000Z")).toBe(true);
  });

  it("keeps the window for an annual sub-cycle anchored on the 31st until its next start", () => {
    // Anchored on Jan 31: the February sub-cycle starts on Feb 28 (clamped).
    expect(startsLaterWindow("2027-01-31T09:00:00.000Z", "2027-02-28T09:00:00.000Z")).toBe(true);
    expect(startsLaterWindow("2027-02-28T09:00:00.000Z", "2027-02-28T09:00:00.000Z")).toBe(false);
  });

  it("does not treat a window moving back (cancellation, undone reset) as new", () => {
    expect(startsLaterWindow("2026-10-15T00:00:00.000Z", "2026-10-01T00:00:00.000Z")).toBe(false);
  });
});

describe("resolveUserAiKey", () => {
  it("issues one key per account, capped at what the plan still includes", async () => {
    billing.usedUsd = 0.2;
    const key = await resolveUserAiKey(USER);

    expect(key).toBe("sk-or-v1-1");
    expect(storedKey()).toMatchObject({
      name: `minddy-cloud:preview-ref:user:${USER}`,
      limit: 5.05,
      limit_reset: null,
    });
    expect(openRouter.requests[0]?.body).toMatchObject({ include_byok_in_limit: false });
    expect(storedRow()).toMatchObject({ baseline_usd: -0.2, plan_id: "go", key_encrypted: "sealed:sk-or-v1-1" });
  });

  it("keeps a single key under concurrent issuance and deletes the losing one", async () => {
    const keys = await Promise.all([resolveUserAiKey(USER), resolveUserAiKey(USER)]);

    expect(new Set(keys).size).toBe(1);
    expect(db.rows).toHaveLength(1);
    expect(openRouter.keys.size).toBe(1);
    expect(openRouter.requests.filter((request) => request.method === "DELETE")).toHaveLength(1);
  });

  it("serves a known key without calling OpenRouter while nothing changed", async () => {
    await resolveUserAiKey(USER);
    clearManagedAiKeyCache();
    openRouter.requests = [];

    await expect(resolveUserAiKey(USER)).resolves.toBe("sk-or-v1-1");
    expect(openRouter.requests).toEqual([]);
  });

  it("re-caps from the key's usage when a new window starts", async () => {
    await resolveUserAiKey(USER);
    storedKey().usage = 4.9;
    billing.windowStart = "2026-11-01T00:00:00.000Z";
    clearManagedAiKeyCache();

    await resolveUserAiKey(USER);
    expect(storedKey().limit).toBe(10.15);
    expect(storedRow()).toMatchObject({ baseline_usd: 4.9, window_start: "2026-11-01T00:00:00.000Z" });
  });

  it("re-caps on a plan change from the Stripe webhook", async () => {
    await resolveUserAiKey(USER);
    storedKey().usage = 1;
    Object.assign(billing, { planId: "pro", includedUsd: 15 });

    await reconcileUserAiKey(USER);
    expect(storedKey().limit).toBe(15.75);
    expect(storedRow()).toMatchObject({ plan_id: "pro", baseline_usd: 0 });
  });

  it("re-caps on the first call of a new window, whatever the cache says", async () => {
    billing.windowEnd = new Date(Date.now() - 1_000).toISOString();
    await resolveUserAiKey(USER);
    storedKey().usage = 5;
    billing.windowStart = new Date().toISOString();

    await resolveUserAiKey(USER);
    expect(storedRow().baseline_usd).toBe(5);
    expect(storedKey().limit).toBe(10.25);
  });

  it("moves the baseline once when two requests re-cap the same new window", async () => {
    await resolveUserAiKey(USER);
    storedKey().usage = 4.9;
    billing.windowStart = "2026-11-01T00:00:00.000Z";
    openRouter.requests = [];

    await Promise.all([reconcileUserAiKey(USER), reconcileUserAiKey(USER)]);
    expect(storedRow()).toMatchObject({ baseline_usd: 4.9 });
    expect(storedKey().limit).toBe(10.15);
    expect(openRouter.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });

  it("raises the cap when the plan's included usage rises under the same plan id", async () => {
    await resolveUserAiKey(USER);
    billing.includedUsd = 8;
    clearManagedAiKeyCache();

    await resolveUserAiKey(USER);
    expect(storedKey().limit).toBe(8.4);
  });

  it("leaves a key blocked by a downgrade alone until something changes", async () => {
    await resolveUserAiKey(USER);
    storedKey().usage = 3;
    Object.assign(billing, { planId: "free", includedUsd: 0.5 });
    await reconcileUserAiKey(USER);
    expect(storedKey().limit).toBe(3);
    openRouter.requests = [];
    clearManagedAiKeyCache();

    await resolveUserAiKey(USER);
    expect(openRouter.requests).toEqual([]);
  });

  it("issues a new key when OpenRouter no longer knows the stored one", async () => {
    await resolveUserAiKey(USER);
    openRouter.keys.clear();
    billing.windowStart = "2026-11-01T00:00:00.000Z";
    clearManagedAiKeyCache();

    await expect(resolveUserAiKey(USER)).resolves.toBe("sk-or-v1-2");
    expect(db.rows).toHaveLength(1);
    expect(storedRow().key_hash).toBe("hash-2");
  });

  it("fails closed without a management key", async () => {
    vi.stubEnv("OPENROUTER_MANAGEMENT_KEY", "");
    vi.stubEnv("OPENROUTER_PROVISIONING_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(resolveUserAiKey(USER)).rejects.toBeInstanceOf(ManagedAiKeyUnavailableError);
    expect(openRouter.requests).toEqual([]);
  });
});

describe("discardManagedAiKey", () => {
  it("deletes a key OpenRouter refused, so that the next call issues another", async () => {
    const first = await resolveUserAiKey(USER);
    await discardManagedAiKey(USER, first);

    expect(db.rows).toHaveLength(0);
    expect(openRouter.keys.size).toBe(0);
    await expect(resolveUserAiKey(USER)).resolves.toBe("sk-or-v1-2");
  });

  it("leaves a key that already replaced the refused one", async () => {
    await resolveUserAiKey(USER);
    await discardManagedAiKey(USER, "sk-or-v1-stale");
    expect(db.rows).toHaveLength(1);
    expect(openRouter.keys.size).toBe(1);
  });
});

describe("resolvePublicAiKey", () => {
  it("issues a single key with a daily cap", async () => {
    await expect(resolvePublicAiKey()).resolves.toBe("sk-or-v1-1");
    expect([...openRouter.keys.values()][0]).toMatchObject({
      name: "minddy-cloud:preview-ref:public",
      limit_reset: "daily",
      limit: 5,
    });
  });
});

describe("resolvePublicAiKey re-cap", () => {
  it("follows a changed daily cap", async () => {
    await resolvePublicAiKey();
    db.rows[0]!.limit_usd = 3;
    clearManagedAiKeyCache();

    await expect(resolvePublicAiKey()).resolves.toBe("sk-or-v1-1");
    expect([...openRouter.keys.values()][0]?.limit).toBe(5);
    expect(db.rows[0]?.limit_usd).toBe(5);
  });
});

describe("deleteUserAiKey", () => {
  it("deletes the key at OpenRouter, then its row", async () => {
    await resolveUserAiKey(USER);
    await expect(deleteUserAiKey(USER)).resolves.toBe(true);
    expect(openRouter.keys.size).toBe(0);
    expect(db.rows).toHaveLength(0);
  });
});

describe("sweepOrphanKeys", () => {
  it("deletes only Minddy keys that no row references and that are old enough", async () => {
    await resolveUserAiKey(USER);
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    const fake = (hash: string, name: string, created_at: string): FakeKey => ({
      hash, name, key: `sk-${hash}`, limit: 1, limit_reset: null, usage: 0, usage_daily: 0, created_at,
    });
    openRouter.keys.set("orphan", fake("orphan", "minddy-cloud:preview-ref:user:gone", old));
    openRouter.keys.set("young", fake("young", "minddy-cloud:preview-ref:user:pending", new Date().toISOString()));
    openRouter.keys.set("foreign", fake("foreign", "someone else's key", old));
    // Production shares the OpenRouter account; its rows live in another database.
    openRouter.keys.set("production", fake("production", "minddy-cloud:prod-ref:user:live", old));

    await expect(sweepOrphanKeys()).resolves.toEqual({ managed: 3, deleted: 1 });
    expect([...openRouter.keys.keys()].sort()).toEqual(["foreign", "hash-1", "production", "young"]);
  });
});
