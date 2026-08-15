import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apnsProviderToken, isApnsConfigured } = await import("./apns");

beforeEach(() => vi.unstubAllEnvs());

describe("configuration APNs", () => {
  it("reste éteinte sans les trois secrets", () => {
    expect(isApnsConfigured()).toBe(false);
    expect(apnsProviderToken()).toBeNull();
  });

  it("fabrique un JWT ES256 portant le team id et le key id", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    vi.stubEnv("APNS_TEAM_ID", "TEAM123456");
    vi.stubEnv("APNS_KEY_ID", "KEY1234567");
    vi.stubEnv(
      "APNS_PRIVATE_KEY",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    );

    const token = apnsProviderToken(1_800_000_000_000)!;
    const [header, claims, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_800_000_000,
    });
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });
});
