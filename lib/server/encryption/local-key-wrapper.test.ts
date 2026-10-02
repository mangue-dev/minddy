import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasDataRootKey, LocalKeyWrapper } from "./local-key-wrapper";

const scope = { kind: "project", id: "tenant-id" } as const;

afterEach(() => vi.unstubAllEnvs());

describe("LocalKeyWrapper", () => {
  it("requires an exact random-key encoding", () => {
    vi.stubEnv("MINDDY_DATA_ROOT_KEY", "short-secret");
    expect(hasDataRootKey()).toBe(false);
    expect(() => new LocalKeyWrapper()).toThrow("32-byte hex key");
    vi.stubEnv("MINDDY_DATA_ROOT_KEY", randomBytes(32).toString("hex"));
    expect(hasDataRootKey()).toBe(true);
  });

  it("round trips distinct data keys and authenticates scope, purpose and ciphertext", async () => {
    vi.stubEnv("MINDDY_DATA_ROOT_KEY", randomBytes(32).toString("hex"));
    const content = new LocalKeyWrapper("content");
    const index = new LocalKeyWrapper("blind_index");
    const first = await content.generate(scope);
    const second = await content.generate(scope);
    const record = { scope, version: 1, wrappedKey: first.wrappedKey };
    try {
      expect(first.bytes).toHaveLength(32);
      expect(first.bytes).not.toEqual(second.bytes);
      expect(first.wrappedKey).not.toEqual(second.wrappedKey);
      expect(await content.unwrap(record)).toEqual(first.bytes);
      await expect(content.unwrap({ ...record, scope: { ...scope, id: "other" } })).rejects.toThrow();
      await expect(index.unwrap(record)).rejects.toThrow();
      const tampered = Buffer.from(first.wrappedKey);
      tampered[tampered.length - 1] ^= 1;
      await expect(content.unwrap({ ...record, wrappedKey: tampered })).rejects.toThrow();
      await expect(content.unwrap({ ...record, wrappedKey: tampered.subarray(1) })).rejects.toThrow();
      vi.stubEnv("MINDDY_DATA_ROOT_KEY", randomBytes(32).toString("hex"));
      await expect(new LocalKeyWrapper().unwrap(record)).rejects.toThrow();
    } finally {
      first.bytes.fill(0);
      second.bytes.fill(0);
    }
  });
});
