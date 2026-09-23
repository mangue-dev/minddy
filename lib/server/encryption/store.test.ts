import { createCipheriv, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { ManagedDataKeys, type KeyRegistry, type KeyWrapper, type WrappedDataKey } from "./keys";
import {
  EncryptedStore,
  blindIndex,
  normalizeEmailForIndex,
  type EncryptionContext,
  type EncryptionScope,
} from "./store";

const scope: EncryptionScope = { kind: "project", id: "project-1" };
const context: EncryptionContext = {
  scope,
  table: "project_invitations",
  column: "invited_email",
  rowId: "row-1",
};

class MemoryRegistry implements KeyRegistry {
  readonly records: WrappedDataKey[] = [];

  async loadCurrent(asked: EncryptionScope) {
    return this.records.filter((row) => row.scope.kind === asked.kind &&
      row.scope.id === asked.id).at(-1) ?? null;
  }

  async loadVersion(asked: EncryptionScope, version: number) {
    return this.records.find((row) => row.scope.kind === asked.kind &&
      row.scope.id === asked.id && row.version === version) ?? null;
  }

  async insertFirst(record: WrappedDataKey) {
    const existing = await this.loadCurrent(record.scope);
    if (existing) return existing;
    this.records.push(record);
    return record;
  }

  async rotate(record: WrappedDataKey, expectedVersion: number) {
    const existing = this.records.filter((row) => row.scope.kind === record.scope.kind &&
      row.scope.id === record.scope.id).at(-1);
    if (existing?.version !== expectedVersion) return false;
    this.records.push(record);
    return true;
  }
}

class MemoryWrapper implements KeyWrapper {
  generateCalls = 0;
  unwrapCalls = 0;

  async generate() {
    this.generateCalls += 1;
    const bytes = randomBytes(32);
    return { bytes, wrappedKey: Buffer.from(bytes) };
  }

  async unwrap(record: WrappedDataKey) {
    this.unwrapCalls += 1;
    return Buffer.from(record.wrappedKey);
  }
}

describe("EncryptedStore", () => {
  it("encrypts different ciphertexts and authenticates the row and column", async () => {
    const keys = new ManagedDataKeys(new MemoryRegistry(), new MemoryWrapper());
    const store = new EncryptedStore(keys);
    const first = await store.encrypt("someone@example.test", context);
    const second = await store.encrypt("someone@example.test", context);
    expect(first).not.toBe(second);
    expect(first).not.toContain("someone@example.test");
    expect(await store.decrypt(first, context)).toBe("someone@example.test");
    await expect(store.decrypt(first, { ...context, rowId: "row-2" }))
      .rejects.toThrow("Unable to decrypt data");
    await expect(store.decrypt(first, { ...context, column: "other" }))
      .rejects.toThrow("Unable to decrypt data");
  });

  it("rejects tampering and malformed ciphertext", async () => {
    const store = new EncryptedStore(new ManagedDataKeys(new MemoryRegistry(), new MemoryWrapper()));
    const value = await store.encrypt({ body: "private" }, context);
    const parsed = JSON.parse(value);
    parsed.data = "AAAA";
    await expect(store.decrypt(store.fromDatabase(JSON.stringify(parsed)), context))
      .rejects.toThrow("Unable to decrypt data");
    expect(() => store.fromDatabase("plain text")).toThrow("Invalid encrypted value");
    expect(() => store.fromDatabase(JSON.stringify({ ...parsed, format: 4 })))
      .toThrow("Invalid encrypted value");
  });

  it("authenticates the key version even if registry versions reference the same wrapped key", async () => {
    const bytes = randomBytes(32);
    const store = new EncryptedStore({
      current: async () => ({ version: 1, bytes: Buffer.from(bytes) }),
      byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(bytes) }),
    });
    const ciphertext = await store.encrypt("private", context);
    const envelope = JSON.parse(ciphertext);
    expect(envelope.format).toBe(3);
    envelope.keyVersion = 2;
    await expect(store.decrypt(store.fromDatabase(JSON.stringify(envelope)), context))
      .rejects.toThrow("Unable to decrypt data");
    envelope.keyVersion = 1;
    envelope.format = 1;
    await expect(store.decrypt(store.fromDatabase(JSON.stringify(envelope)), context))
      .rejects.toThrow("Unable to decrypt data");
  });

  it.each([1, 2])("reads existing format-%i ciphertext without rewriting or guessing its AAD", async (format) => {
    const bytes = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", bytes, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([
      `minddy-data-v${format}`, context.scope.kind, context.scope.id, context.table, context.column, context.rowId,
      ...(format === 2 ? [1] : []),
    ])));
    const data = Buffer.concat([cipher.update(JSON.stringify("legacy")), cipher.final()]);
    const store = new EncryptedStore({
      current: async () => ({ version: 1, bytes: Buffer.from(bytes) }),
      byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(bytes) }),
    });
    const legacy = store.fromDatabase<string>(JSON.stringify({
      format, keyVersion: 1, iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"), data: data.toString("base64url"),
    }));
    expect(await store.decrypt(legacy, context)).toBe("legacy");
  });

  it("interoperates with WebCrypto HKDF/AES-GCM and derives a different key for each write", async () => {
    const bytes = randomBytes(32);
    const store = new EncryptedStore({
      current: async () => ({ version: 7, bytes: Buffer.from(bytes) }),
      byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(bytes) }),
    });
    const source = { text: "Private content", nested: [null, false, 42] };
    const first = JSON.parse(await store.encrypt(source, context));
    const second = JSON.parse(await store.encrypt(source, context));
    expect(first.salt).not.toBe(second.salt);
    const material = await webcrypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
    const additionalData = Buffer.from(JSON.stringify([
      "minddy-data-v3", scope.kind, scope.id, context.table, context.column, context.rowId, 7, "json",
    ]));
    const keyFor = (salt: string) => webcrypto.subtle.deriveKey({
      name: "HKDF", hash: "SHA-256", salt: Buffer.from(salt, "base64url"), info: additionalData,
    }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const ciphertext = Buffer.concat([Buffer.from(first.data, "base64url"), Buffer.from(first.tag, "base64url")]);
    const algorithm = { name: "AES-GCM", iv: Buffer.from(first.iv, "base64url"), additionalData, tagLength: 128 };
    const opened = await webcrypto.subtle.decrypt(algorithm, await keyFor(first.salt), ciphertext);
    expect(JSON.parse(Buffer.from(opened).toString())).toEqual(source);
    await expect(webcrypto.subtle.decrypt(algorithm, await keyFor(second.salt), ciphertext)).rejects.toThrow();

    const written = Buffer.from(await webcrypto.subtle.encrypt(algorithm, await keyFor(first.salt),
      Buffer.from(JSON.stringify("WebCrypto fixture"))));
    const fixture = store.fromDatabase<string>(JSON.stringify({
      ...first, data: written.subarray(0, -16).toString("base64url"), tag: written.subarray(-16).toString("base64url"),
    }));
    expect(await store.decrypt(fixture, context)).toBe("WebCrypto fixture");
  });

  it("rejects a missing or altered derivation salt and format downgrades", async () => {
    const store = new EncryptedStore(new ManagedDataKeys(new MemoryRegistry(), new MemoryWrapper()));
    const envelope = JSON.parse(await store.encrypt("private", context));
    for (const salt of [undefined, "", "AA", "=".repeat(43)]) {
      expect(() => store.fromDatabase(JSON.stringify({ ...envelope, salt }))).toThrow("Invalid encrypted value");
    }
    for (const changed of [
      { ...envelope, salt: randomBytes(32).toString("base64url") },
      { ...envelope, format: 2 },
      { ...envelope, format: 1 },
    ]) {
      await expect(store.decrypt(store.fromDatabase(JSON.stringify(changed)), context)).rejects.toThrow("Unable to decrypt");
    }
  });

  it("does not call KMS again for fresh message keys while the scope key is cached", async () => {
    const wrapper = new MemoryWrapper();
    const store = new EncryptedStore(new ManagedDataKeys(new MemoryRegistry(), wrapper));
    const ciphertexts = [];
    for (let i = 0; i < 100; i += 1) ciphertexts.push(await store.encrypt({ i }, context));
    for (let i = 0; i < ciphertexts.length; i += 1) expect(await store.decrypt(ciphertexts[i], context)).toEqual({ i });
    expect(wrapper.generateCalls).toBe(1);
    expect(wrapper.unwrapCalls).toBe(0);
    expect(new Set(ciphertexts.map((value) => JSON.parse(value).salt)).size).toBe(100);
  });

  it("round-trips raw binary and empty buffers without confusing them with JSON envelopes", async () => {
    const store = new EncryptedStore(new ManagedDataKeys(new MemoryRegistry(), new MemoryWrapper()));
    for (const bytes of [Buffer.alloc(0), Buffer.from([0, 255, 128, 32]), Buffer.from('"valid JSON"')]) {
      const encrypted = await store.encryptBytes(bytes, context);
      expect(await store.decryptBytes(encrypted, context)).toEqual(bytes);
      await expect(store.decrypt(encrypted, context)).rejects.toThrow("encoding");
      const envelope = JSON.parse(encrypted);
      envelope.encoding = "json";
      if (bytes.length) {
        await expect(store.decrypt(store.fromDatabase(JSON.stringify(envelope)), context)).rejects.toThrow("Unable to decrypt");
      }
    }
    const json = await store.encrypt("value", context);
    await expect(store.decryptBytes(store.fromDatabase<Uint8Array>(json), context)).rejects.toThrow("encoding");
  });

  it("reads the recorded key version after rotation", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(registry, wrapper);
    const store = new EncryptedStore(keys);
    const before = await store.encrypt("before", context);
    expect(await keys.rotate(scope)).toBe(2);
    const after = await store.encrypt("after", context);
    expect(JSON.parse(after).keyVersion).toBe(2);
    expect(await store.decrypt(before, context)).toBe("before");
    expect(await store.decrypt(after, context)).toBe("after");
  });

  it("observes a rotation performed by another application instance", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const writer = new ManagedDataKeys(registry, wrapper);
    const rotatingInstance = new ManagedDataKeys(registry, wrapper);
    expect((await writer.current(scope)).version).toBe(1);
    expect(await rotatingInstance.rotate(scope)).toBe(2);
    expect((await writer.current(scope)).version).toBe(2);
  });

  it("does not rotate a stale scheduled candidate a second time", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(registry, wrapper);
    (await keys.current(scope)).bytes.fill(0);
    expect(await keys.rotate(scope, 1)).toBe(2);
    expect(await keys.rotate(scope, 1)).toBe(2);
    expect(wrapper.generateCalls).toBe(2);
    expect(registry.records).toHaveLength(2);
  });

  it("coalesces concurrent scheduled rotations through the registry CAS", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(registry, wrapper);
    (await keys.current(scope)).bytes.fill(0);
    const rotated = await Promise.all([keys.rotate(scope, 1), keys.rotate(scope, 1)]);
    expect(rotated).toEqual([2, 2]);
    expect(registry.records).toHaveLength(2);
  });

  it("reports a regressed registry version instead of silently accepting a rollback", async () => {
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(new MemoryRegistry(), wrapper);
    (await keys.current(scope)).bytes.fill(0);
    await expect(keys.rotate(scope, 2)).rejects.toThrow("version regressed");
    expect(wrapper.generateCalls).toBe(1);
  });

  it("returns the winning initial version and clears the caller key copy", async () => {
    const registry = new MemoryRegistry();
    const keys = new ManagedDataKeys(registry, new MemoryWrapper());
    const initialBytes = randomBytes(32);
    vi.spyOn(keys, "current").mockResolvedValue({ version: 2, bytes: initialBytes });
    expect(await keys.rotate(scope)).toBe(2);
    expect(initialBytes).toEqual(Buffer.alloc(32));
  });

  it("coalesces concurrent first-key creation", async () => {
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(new MemoryRegistry(), wrapper);
    await Promise.all(Array.from({ length: 20 }, () => keys.current(scope)));
    expect(wrapper.generateCalls).toBe(1);
  });

  it("returns concurrent key loads even when the cache cannot retain every scope", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const scopes = [scope, { ...scope, id: "project-2" }];
    const setup = new ManagedDataKeys(registry, wrapper);
    for (const item of scopes) (await setup.current(item)).bytes.fill(0);
    const keys = new ManagedDataKeys(registry, wrapper, 60_000, 1);
    const loaded = await Promise.all(scopes.map((item) => keys.byVersion(item, 1)));
    for (let index = 0; index < scopes.length; index++) {
      expect(loaded[index].bytes).toEqual(Buffer.from(registry.records[index].wrappedKey));
      loaded[index].bytes.fill(0);
    }
  });

  it("coalesces unwraps, clears temporary key bytes and retries a failed load", async () => {
    const registry = new MemoryRegistry();
    const wrapper = new MemoryWrapper();
    const setup = new ManagedDataKeys(registry, wrapper);
    (await setup.current(scope)).bytes.fill(0);
    const keys = new ManagedDataKeys(registry, wrapper);
    const plaintext = Buffer.from(registry.records[0].wrappedKey);
    const unwrap = vi.spyOn(wrapper, "unwrap")
      .mockRejectedValueOnce(new Error("KMS unavailable"))
      .mockResolvedValueOnce(plaintext);
    await expect(keys.byVersion(scope, 1)).rejects.toThrow("KMS unavailable");
    const loaded = await Promise.all([keys.byVersion(scope, 1), keys.byVersion(scope, 1)]);
    expect(unwrap).toHaveBeenCalledTimes(2);
    expect(plaintext).toEqual(Buffer.alloc(32));
    for (const key of loaded) expect(key.bytes).toEqual(Buffer.from(registry.records[0].wrappedKey));
    loaded[0].bytes.fill(0);
    expect(loaded[1].bytes).not.toEqual(Buffer.alloc(32));
    loaded[1].bytes.fill(0);
  });

  it("zeroes an idle cached key when its TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const keys = new ManagedDataKeys(new MemoryRegistry(), new MemoryWrapper(), 1_000);
      const current = await keys.current(scope);
      const cache = (keys as unknown as { cache: Map<string, { key: { bytes: Buffer } }> }).cache;
      const cachedBytes = cache.get("project:project-1:1")!.key.bytes;
      expect(cachedBytes.equals(current.bytes)).toBe(true);
      vi.advanceTimersByTime(1_001);
      expect(cache.size).toBe(0);
      expect(cachedBytes.equals(Buffer.alloc(32))).toBe(true);
      current.bytes.fill(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("blindIndex", () => {
  it("uses scoped, purpose-specific HMAC values", () => {
    const key = randomBytes(32);
    const email = normalizeEmailForIndex(" Alice@Example.Test ");
    expect(email).toBe("alice@example.test");
    const first = blindIndex(email, context, key);
    expect(first).toHaveLength(64);
    expect(first).toBe(blindIndex(email, context, key));
    expect(first).not.toBe(blindIndex(email, {
      ...context,
      scope: { kind: "project", id: "project-2" },
    }, key));
    expect(first).not.toBe(blindIndex(email, { ...context, column: "other" }, key));
  });
});
