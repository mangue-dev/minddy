import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

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
    const existing = await this.loadCurrent(record.scope);
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
    expect(() => store.fromDatabase(JSON.stringify({ ...parsed, format: 2 })))
      .toThrow("Invalid encrypted value");
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

  it("coalesces concurrent first-key creation", async () => {
    const wrapper = new MemoryWrapper();
    const keys = new ManagedDataKeys(new MemoryRegistry(), wrapper);
    await Promise.all(Array.from({ length: 20 }, () => keys.current(scope)));
    expect(wrapper.generateCalls).toBe(1);
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
