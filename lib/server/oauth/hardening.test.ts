import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE THREE GUARDS OF MIN-346.
 *
 * Dynamic client registration is open: everything after that is
 * driven by an attacker. Hence three questions, and only one acceptable answer
 * to each.
 *
 * 1. Does an invalid protocol parameter send the user to the
 * client? No — otherwise minddy is a permanent open forwarder under its
 * own domain, triggerable by a simple URL.
 * 2. Is a refresh token presented by ANOTHER client exchanged? No — the
 * token is tied to the client that obtained it.
 * 3. Can DCR purge remove an active client when the list of
 * grants exceeds one page? No — and this is the case that caused it to destroy
 * living permissions, without saying anything.
 */

interface Row extends Record<string, unknown> {}

let db: Record<string, Row[]> = {};
/** The UPDATEs actually sent (table + values) — a refusal given AFTER
 the writing would not have refused anything. */
let updateLog: Array<{ table: string; values: Row }> = [];

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let mode: "select" | "update" = "select";
  let payload: Row = {};
  let range: { from: number; to: number } | null = null;

  const matching = () => {
    const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    return range ? rows.slice(range.from, range.to + 1) : rows;
  };

  const run = () => {
    if (mode === "update") {
      const matched = matching();
      if (matched.length > 0) updateLog.push({ table, values: payload });
      matched.forEach((r) => Object.assign(r, payload));
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    return { data: matching().map((r) => ({ ...r })), error: null };
  };

  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    gt: (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") > val);
      return q;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    },
    lt: (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "") < val);
      return q;
    },
    limit: () => q,
    range: (from: number, to: number) => {
      range = { from, to };
      return q;
    },
    update: (values: Row) => {
      mode = "update";
      payload = values;
      return q;
    },
    maybeSingle: async () => {
      const result = run();
      return { data: (result.data as Row[])[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(run()).then(onFulfilled),
  });
  return q;
}

const service = { from: (table: string) => makeQuery(table) };

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (fn: () => Promise<void>) => void fn(),
}));

/** The client that `validateAuthorizeRequest` will fetch from the base. */
let registeredClient: {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
} | null = null;

vi.mock("@/lib/server/oauth/clients", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getClient: async (id: unknown) =>
    registeredClient && id === registeredClient.client_id ? registeredClient : null,
}));

const { validateAuthorizeRequest } = await import(
  "@/lib/server/oauth/authorize-validation"
);
const { rotateRefreshToken, handleRefreshReuse } = await import(
  "@/lib/server/oauth/grants"
);
const { selectClientsWithoutGrants } = await import("@/lib/server/oauth/clients");
const { sha256Hex } = await import("@/lib/server/oauth/crypto");
const { getClientIp } = await import("@/lib/server/request-ip");

const ORIGIN = "https://www.minddy.app";
const CALLBACK = "https://evil.example.com/callback";
// base64url(sha256) = 43 characters.
const CHALLENGE = "a".repeat(43);

beforeEach(() => {
  db = {};
  updateLog = [];
  registeredClient = {
    client_id: "cli_attacker",
    client_name: "Claude",
    redirect_uris: [CALLBACK],
    created_at: "2026-01-01T00:00:00+00:00",
  };
});

describe("authorization request: no redirect on protocol error", () => {
  const base = {
    client_id: "cli_attacker",
    redirect_uri: CALLBACK,
    response_type: "code",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "xyz",
  };

  it("accepts a valid request", async () => {
    const v = await validateAuthorizeRequest(base, ORIGIN);
    expect(v.kind).toBe("ok");
  });

  /**
 * The heart of the ticket: each of these parameters is placed in the URL, without
 * knowing anything about the user. If one of them produced a redirect,
 * `https://www.minddy.app/oauth/authorize?…` would become a one-way ticket
 * to the attacker's address, under our name and certificate.
 */
  it.each([
    ["response_type", { ...base, response_type: "token" }],
    ["code_challenge_method", { ...base, code_challenge_method: "plain" }],
    ["code_challenge absent", { ...base, code_challenge: undefined }],
    ["code_challenge hors gabarit", { ...base, code_challenge: "trop-court" }],
    ["scope", { ...base, scope: "admin" }],
    ["resource", { ...base, resource: "https://evil.example.com/api/mcp" }],
  ])("refuse sur place : %s", async (_label, params) => {
    const v = await validateAuthorizeRequest(params, ORIGIN);
    expect(v.kind).toBe("invalid");
    // The verdict doesn't even HAVE a redirect URI: there is nothing to
    // suivre, par construction.
    expect(JSON.stringify(v)).not.toContain("evil.example.com");
  });

  it("refuse le client inconnu et l'URI non enregistrée", async () => {
    expect(
      (await validateAuthorizeRequest({ ...base, client_id: "cli_ghost" }, ORIGIN)).kind
    ).toBe("invalid");
    expect(
      (
        await validateAuthorizeRequest(
          { ...base, redirect_uri: "https://elsewhere.example.com/cb" },
          ORIGIN
        )
      ).kind
    ).toBe("invalid");
  });
});

describe("refresh token bound to its client", () => {
  const TOKEN = "mdyrt_secret";
  const FUTURE = new Date(Date.now() + 3600_000).toISOString();

  beforeEach(() => {
    db.oauth_grants = [
      {
        id: "grant-1",
        client_id: "cli_legit",
        user_id: "user-1",
        api_key_id: "key-1",
        scope: "minddy",
        refresh_token_hash: sha256Hex(TOKEN),
        refresh_token_expires_at: FUTURE,
        prev_refresh_token_hash: null,
        revoked_at: null,
      },
    ];
  });

  it("exchanges the token for the client that obtained it", async () => {
    const pair = await rotateRefreshToken(TOKEN, "cli_legit");
    expect(pair?.scope).toBe("minddy");
  });

  it("rejects the same token presented by another client", async () => {
    expect(await rotateRefreshToken(TOKEN, "cli_attacker")).toBeNull();
    // And above all: the line has not moved. A refusal which would still have
    // rotated the token would disconnect the legitimate client.
    expect(updateLog).toHaveLength(0);
    expect(db.oauth_grants[0].refresh_token_hash).toBe(sha256Hex(TOKEN));
  });

  it("a replay revocation remains with the affected client", async () => {
    db.oauth_grants[0].prev_refresh_token_hash = sha256Hex("mdyrt_old");
    expect(await handleRefreshReuse("mdyrt_old", "cli_attacker")).toBe(false);
    expect(db.oauth_grants[0].revoked_at ?? null).toBeNull();

    expect(await handleRefreshReuse("mdyrt_old", "cli_legit")).toBe(true);
    expect(db.oauth_grants[0].revoked_at).toBeTruthy();
  });
});

describe("purge DCR : ne supprimer que ce qu'on a lu en entier", () => {
  /** An active customer whose grants fall beyond the first page. */
  it("ne condamne pas un client dont les grants dépassent la page", async () => {
    const candidates = ["cli_a", "cli_b"];
    // 1000 grants of cli_a (a full page), then the only grant of cli_b.
    const grants = [
      ...Array.from({ length: 1000 }, () => "cli_a"),
      "cli_b",
    ];
    const doomed = await selectClientsWithoutGrants(candidates, async (_ids, from, to) => ({
      clientIds: grants.slice(from, to + 1),
    }));
    expect(doomed).toEqual([]);
  });

  it("condamne les candidats sans aucun grant", async () => {
    const doomed = await selectClientsWithoutGrants(
      ["cli_spam1", "cli_spam2", "cli_used"],
      async () => ({ clientIds: ["cli_used"] })
    );
    expect(doomed).toEqual(["cli_spam1", "cli_spam2"]);
  });

  it("ne supprime rien si la lecture des grants échoue", async () => {
    const doomed = await selectClientsWithoutGrants(["cli_a"], async () => ({
      failed: true as const,
    }));
    expect(doomed).toEqual([]);
  });
});

describe("IP du client : le dernier relais, jamais l'appelant", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://www.minddy.app/api/oauth/token", { headers });

  it("ignore la valeur de tête que le client a injectée", () => {
    // The caller sent "1.2.3.4"; the relay added the real one.
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe(
      "203.0.113.7"
    );
  });

  it("préfère les en-têtes que la plateforme écrase", () => {
    expect(
      getClientIp(
        req({ "x-forwarded-for": "1.2.3.4", "x-vercel-forwarded-for": "203.0.113.7" })
      )
    ).toBe("203.0.113.7");
    expect(
      getClientIp(req({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("retombe sur un bucket partagé plutôt que sur rien", () => {
    expect(getClientIp(req({}))).toBe("unknown");
    expect(getClientIp(req({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("issuer dérivé de l'environnement", () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
    vi.resetModules();
  });

  const load = async () => (await import("@/lib/server/oauth/issuer")).oauthIssuer();

  it("en production, le domaine canonique — quel que soit l'alias emprunté", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "";
    process.env.NEXT_PUBLIC_APP_URL = "https://tickets.example.test";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "minddy-abc123.vercel.app";
    expect(await load()).toBe("https://tickets.example.test");
  });

  it("en preview, le déploiement lui-même", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "minddy-abc123.vercel.app";
    expect(await load()).toBe("https://minddy-abc123.vercel.app");
  });

  it("OAUTH_ISSUER passe devant, réduit à son origine", async () => {
    vi.resetModules();
    process.env.OAUTH_ISSUER = "https://tunnel.example.com/ignored/path";
    process.env.VERCEL_ENV = "production";
    expect(await load()).toBe("https://tunnel.example.com");
  });
});
