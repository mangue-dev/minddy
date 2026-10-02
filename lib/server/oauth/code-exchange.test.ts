import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore } from "@/lib/server/encryption/store";

interface CodeRow extends Record<string, unknown> {
  code_hash: string;
  client_id: string;
  redirect_uri: string | null;
  resource?: string | null;
  encrypted_content?: string | null;
  encryption_version?: number;
  code_challenge: string;
  used_at: string | null;
  expires_at: string;
  grant_id: string;
}

let rows: CodeRow[] = [];

function makeQuery() {
  const filters: Array<(row: CodeRow) => boolean> = [];
  let update: Record<string, unknown> | null = null;

  const query = {
    select: () => query,
    update: (values: Record<string, unknown>) => {
      update = values;
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return query;
    },
    not: (column: string, operator: string, value: unknown) => {
      expect(operator).toBe("is");
      filters.push((row) => (row[column] ?? null) !== value);
      return query;
    },
    gt: (column: string, value: string) => {
      filters.push((row) => String(row[column] ?? "") > value);
      return query;
    },
    maybeSingle: async () => {
      const row = rows.find((candidate) => filters.every((filter) => filter(candidate)));
      if (row && update) Object.assign(row, update);
      return { data: row ? { ...row } : null, error: null };
    },
  };
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => makeQuery() }),
}));
const material = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(material) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(material) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));

const { claimAuthorizationCode, findReplayedCode } = await import(
  "@/lib/server/oauth/codes"
);
const { pkceS256Challenge, sha256Hex } = await import("@/lib/server/oauth/crypto");
const { encodeOAuthCodeContent } = await import("@/lib/server/oauth/code-content");

const CODE = "mdyac_authorization-code";
const VERIFIER = "v".repeat(43);
const CHALLENGE = pkceS256Challenge(VERIFIER) as string;
const EXCHANGE = {
  clientId: "client-1",
  redirectUri: "https://client.example.test/callback",
  codeChallenge: CHALLENGE,
};

beforeEach(() => {
  rows = [
    {
      code_hash: sha256Hex(CODE),
      client_id: EXCHANGE.clientId,
      user_id: "user-1",
      grant_id: "grant-1",
      redirect_uri: EXCHANGE.redirectUri,
      code_challenge: CHALLENGE,
      scope: "minddy",
      resource: null,
      used_at: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  ];
});

describe("OAuth authorization-code exchange binding", () => {
  it.each([
    ["PKCE", { ...EXCHANGE, codeChallenge: "wrong-challenge" }],
    ["client", { ...EXCHANGE, clientId: "client-2" }],
    ["redirect URI", { ...EXCHANGE, redirectUri: "https://client.example.test/wrong" }],
  ])("does not consume a code when the %s binding is invalid", async (_label, exchange) => {
    expect(await claimAuthorizationCode(CODE, exchange)).toBeNull();
    expect(rows[0].used_at).toBeNull();
  });

  it("consumes a correctly bound code and recognizes only a proven replay", async () => {
    expect((await claimAuthorizationCode(CODE, EXCHANGE))?.grant_id).toBe("grant-1");
    expect(rows[0].used_at).toEqual(expect.any(String));

    expect(
      await findReplayedCode(CODE, { ...EXCHANGE, codeChallenge: "wrong-challenge" })
    ).toBeNull();
    expect(await findReplayedCode(CODE, EXCHANGE)).toBe("grant-1");
  });

  it("consumes a sealed code with the same atomic exchange checks", async () => {
    const row = rows[0];
    const encoded = await encodeOAuthCodeContent({ code_hash: row.code_hash,
      user_id: row.user_id as string }, { redirect_uri: EXCHANGE.redirectUri,
      resource: "https://private.example/resource" });
    Object.assign(row, encoded, { redirect_uri: null, resource: null });
    expect(JSON.stringify(row)).not.toContain("private.example");
    expect(await claimAuthorizationCode(CODE, { ...EXCHANGE,
      redirectUri: "https://client.example.test/wrong" })).toBeNull();
    expect(row.used_at).toBeNull();
    expect((await claimAuthorizationCode(CODE, EXCHANGE))?.resource)
      .toBe("https://private.example/resource");
    expect(row.used_at).toEqual(expect.any(String));
    expect(await findReplayedCode(CODE, EXCHANGE)).toBe("grant-1");
  });
});
