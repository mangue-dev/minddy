import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EncryptedStore } from "./store";

const secret = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(secret) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(secret) }),
});
vi.mock("./registry", () => ({ getEncryptedStore: () => store }));

import { decodeAppConfig, encodeAppConfig } from "./app-config-content";

afterEach(() => vi.unstubAllEnvs());

describe("app configuration content", () => {
  it("seals values and binds them to their actual key", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const saved = await encodeAppConfig("private_setting", "private-value");
    expect(saved.value).toBeNull();
    expect(JSON.stringify(saved)).not.toContain("private-value");
    expect(await decodeAppConfig(saved)).toBe("private-value");
    await expect(decodeAppConfig({ ...saved, key: "another_setting" }))
      .rejects.toThrow();
    await expect(decodeAppConfig({ ...saved, value: "leftover" }))
      .rejects.toThrow("retains plaintext");
  });

  it("keeps already protected values sealed while the write flag is off", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    expect(await encodeAppConfig("legacy", "clear", 0)).toEqual({
      key: "legacy", value: "clear",
    });
    const saved = await encodeAppConfig("protected", "replacement", 1);
    expect(saved.value).toBeNull();
    expect(await decodeAppConfig(saved)).toBe("replacement");
  });
});
