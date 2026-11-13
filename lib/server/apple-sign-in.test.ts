import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Sign in with Apple tokens (MIN-907): what account deletion revokes, and how
 * they are kept until then (App Review guideline 5.1.1(v)).
 */

// A store that seals by wrapping, and refuses another row's context.
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => ({
    encrypt: async (value: unknown, context: { rowId: string }) =>
      JSON.stringify({ sealed: value, rowId: context.rowId }),
    fromDatabase: (value: unknown) => value,
    versionOf: () => 1,
    decrypt: async (value: string, context: { rowId: string }) => {
      const parsed = JSON.parse(value) as { sealed: unknown; rowId: string };
      if (parsed.rowId !== context.rowId) throw new Error("wrong context");
      return parsed.sealed;
    },
  }),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => { throw new Error("unused"); } }));

const { appleClientSecret, revokeAppleAuthorizations, saveAppleAuthorization } =
  await import("./apple-sign-in");

const USER = "11111111-1111-4111-8111-111111111111";
const IOS = "app.minddy.ios";
const WEB = "app.minddy.web";

function fakeService(rows: Array<Record<string, unknown>> = []) {
  const upserts: Array<Record<string, unknown>> = [];
  const service = {
    from: (table: string) => {
      expect(table).toBe("apple_sign_in_tokens");
      return {
        select: () => ({
          eq: async (column: string, value: unknown) => ({
            data: rows.filter((row) => row[column] === value),
            error: null,
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { service: service as never, upserts };
}

const fetchMock = vi.fn();

beforeEach(() => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  vi.stubEnv("APPLE_SIGN_IN_TEAM_ID", "TEAM123456");
  vi.stubEnv("APPLE_SIGN_IN_KEY_ID", "KEY1234567");
  vi.stubEnv("APPLE_SIGN_IN_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  vi.stubEnv("APPLE_SIGN_IN_IOS_CLIENT_ID", IOS);
  vi.stubEnv("APPLE_SIGN_IN_WEB_CLIENT_ID", WEB);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const formOf = (call: unknown[]) =>
  Object.fromEntries(new URLSearchParams((call[1] as { body: string }).body));
const claimsOf = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as Record<string, unknown>;

describe("appleClientSecret", () => {
  it("signs a short ES256 JWT issued by the team for the client", () => {
    const secret = appleClientSecret(IOS, 1_800_000_000_000)!;
    const [header, , signature] = secret.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(claimsOf(secret)).toEqual({
      iss: "TEAM123456",
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      aud: "https://appleid.apple.com",
      sub: IOS,
    });
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });

  it("is absent without the key", () => {
    vi.stubEnv("APPLE_SIGN_IN_PRIVATE_KEY", "");
    expect(appleClientSecret(IOS)).toBeNull();
  });
});

describe("saveAppleAuthorization", () => {
  it("exchanges the app's code with the bundle identifier and keeps only a sealed token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ refresh_token: "r-apple" }), { status: 200 }));
    const { service, upserts } = fakeService();

    expect(await saveAppleAuthorization(USER, "ios", { authorizationCode: "c-once" }, service)).toBe(true);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://appleid.apple.com/auth/token");
    const form = formOf(fetchMock.mock.calls[0]);
    expect(form).toMatchObject({ client_id: IOS, grant_type: "authorization_code", code: "c-once" });
    expect(claimsOf(form.client_secret).sub).toBe(IOS);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ user_id: USER, client_id: IOS, encryption_version: 1 });
    expect(JSON.stringify(Object.keys(upserts[0]))).not.toContain("refresh_token");
    expect(JSON.parse(upserts[0].encrypted_content as string)).toEqual({
      sealed: { refreshToken: "r-apple" },
      rowId: JSON.stringify([USER, IOS]),
    });
  });

  it("checks a web refresh token against Apple before keeping it", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const { service, upserts } = fakeService();

    expect(await saveAppleAuthorization(USER, "web", { refreshToken: "not-apple" }, service)).toBe(false);
    expect(formOf(fetchMock.mock.calls[0])).toMatchObject({
      client_id: WEB,
      grant_type: "refresh_token",
      refresh_token: "not-apple",
    });
    expect(upserts).toHaveLength(0);
  });

  it("does nothing when the client is not configured", async () => {
    vi.stubEnv("APPLE_SIGN_IN_IOS_CLIENT_ID", "");
    const { service, upserts } = fakeService();
    expect(await saveAppleAuthorization(USER, "ios", { authorizationCode: "c" }, service)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });
});

describe("revokeAppleAuthorizations", () => {
  const sealed = (clientId: string, refreshToken: string) => ({
    user_id: USER,
    client_id: clientId,
    encrypted_content: JSON.stringify({ sealed: { refreshToken }, rowId: JSON.stringify([USER, clientId]) }),
    encryption_version: 1,
  });

  it("revokes every kept token at Apple with its own client", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 200 }));
    const { service } = fakeService([sealed(IOS, "r-ios"), sealed(WEB, "r-web")]);

    expect(await revokeAppleAuthorizations(USER, service)).toEqual({ revoked: 2, warnings: [] });

    const calls = fetchMock.mock.calls.map((call) => [call[0], formOf(call)] as const);
    expect(calls.map(([url]) => url)).toEqual([
      "https://appleid.apple.com/auth/revoke",
      "https://appleid.apple.com/auth/revoke",
    ]);
    expect(calls.map(([, form]) => [form.client_id, form.token, form.token_type_hint])).toEqual([
      [IOS, "r-ios", "refresh_token"],
      [WEB, "r-web", "refresh_token"],
    ]);
    for (const [, form] of calls) expect(claimsOf(form.client_secret).sub).toBe(form.client_id);
  });

  it("reports a refusal as a warning that never carries the token", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    const { service } = fakeService([sealed(IOS, "r-secret")]);

    const result = await revokeAppleAuthorizations(USER, service);
    expect(result.revoked).toBe(0);
    expect(result.warnings).toEqual([`apple ${IOS}: revocation refused (400)`]);
    expect(result.warnings.join()).not.toContain("r-secret");
  });

  it("has nothing to revoke for an account that never used Apple", async () => {
    const { service } = fakeService([]);
    expect(await revokeAppleAuthorizations(USER, service)).toEqual({ revoked: 0, warnings: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
