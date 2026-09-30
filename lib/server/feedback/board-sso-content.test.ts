import { afterEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.alloc(32, 83) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.alloc(32, 83) };
    },
  }),
}));

import { boardSsoState, decodeBoardSso, encodeBoardSso } from
  "./board-sso-content";
import { encryptBoardSsoSecret } from "./sso-crypto";

afterEach(() => vi.unstubAllEnvs());

describe("project-bound feedback SSO secrets", () => {
  it("stores no clear secret and rejects another board, project or key version", async () => {
    const secret = "fbsso_private_visitor_signing_key";
    const stored = await encodeBoardSso("project-one", "board-one", secret);
    expect(stored).toMatch(/^mdyb3:2:/);
    expect(stored).not.toContain(secret);
    expect(boardSsoState(stored)).toEqual({ version: 2, format: 3 });
    expect(await decodeBoardSso("project-one", "board-one", stored))
      .toBe(secret);
    await expect(decodeBoardSso("project-two", "board-one", stored))
      .rejects.toThrow();
    await expect(decodeBoardSso("project-one", "board-two", stored))
      .rejects.toThrow();
    await expect(decodeBoardSso("project-one", "board-one",
      stored.replace("mdyb3:2:", "mdyb3:1:"))).rejects.toThrow();
  });

  it("reads a historical environment-key envelope for migration", async () => {
    vi.stubEnv("FEEDBACK_SSO_ENCRYPTION_SECRET", "a".repeat(64));
    const clear = "fbsso_historical_private_secret";
    const legacy = encryptBoardSsoSecret(clear);
    expect(legacy).not.toContain(clear);
    expect(await decodeBoardSso("project-one", "board-one", legacy))
      .toBe(clear);
    vi.stubEnv("FEEDBACK_SSO_ENCRYPTION_SECRET", "b".repeat(64));
    await expect(decodeBoardSso("project-one", "board-one", legacy))
      .rejects.toThrow();
  });
});
