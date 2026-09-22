import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import { AwsKmsKeyWrapper } from "./aws-kms";
import { ManagedDataKeys, type KeyRegistry, type WrappedDataKey } from "./keys";
import { EncryptedStore } from "./store";

const enabled = process.env.MINDDY_KMS_INTEGRATION_TEST === "true";

function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(3));
  return { samples: sorted.length, p50_ms: at(0.5), p95_ms: at(0.95), p99_ms: at(0.99) };
}

describe.skipIf(!enabled)("real KMS integration (explicit opt-in, test key only)", () => {
  it("unwraps only the authenticated scope, survives DEK rotation and measures cold/warm crypto", async () => {
    const keyId = process.env.MINDDY_DATA_KMS_KEY_ID;
    const region = process.env.MINDDY_DATA_KMS_REGION ?? process.env.AWS_REGION;
    if (!keyId || !region) throw new Error("Configure a test KMS key ARN, region and AWS role credentials first");
    const records: WrappedDataKey[] = [];
    const registry: KeyRegistry = {
      loadCurrent: async () => records.at(-1) ?? null,
      loadVersion: async (_scope, version) => records.find((item) => item.version === version) ?? null,
      insertFirst: async (record) => { records.push(record); return record; },
      rotate: async (record, expected) => {
        if (records.at(-1)?.version !== expected) return false;
        records.push(record);
        return true;
      },
    };
    const wrapper = new AwsKmsKeyWrapper(keyId, region);
    const keys = new ManagedDataKeys(registry, wrapper);
    const store = new EncryptedStore(keys);
    const scope = { kind: "project" as const, id: randomUUID() };
    const context = { scope, table: "encryption_integration_fixture", column: "content", rowId: randomUUID() };
    try {
      const source = "x".repeat(1024);
      const original = await store.encrypt(source, context);
      const cold: number[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        keys.invalidate(scope);
        const start = performance.now();
        expect(await store.decrypt(original, context)).toBe(source);
        cold.push(performance.now() - start);
      }
      const warm: number[] = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        const start = performance.now();
        const value = await store.encrypt(source, context);
        expect(await store.decrypt(value, context)).toBe(source);
        warm.push(performance.now() - start);
      }
      await expect(wrapper.unwrap({ ...records[0], scope: { ...scope, id: randomUUID() } })).rejects.toThrow();
      expect(await keys.rotate(scope, 1)).toBe(2);
      expect(await store.decrypt(original, context)).toBe(source);
      const current = await store.encrypt({ nested: [source, null, false] }, context);
      expect(store.versionOf(current)).toBe(2);
      keys.invalidate(scope);
      expect(await store.decrypt(current, context)).toEqual({ nested: [source, null, false] });
      // In-memory registry: these are crypto/KMS timings, not repository or search benchmarks.
      console.info("[kms-integration]", { cold_decrypt: percentiles(cold), warm_round_trip: percentiles(warm) });
    } finally {
      keys.invalidate(scope);
    }
  }, 60_000);
});
