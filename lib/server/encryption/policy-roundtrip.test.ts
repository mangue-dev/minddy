import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/docs/security/encryption/schema.json";
import policies from "./data-policy.json";
import { EncryptedRowCodec, type ProtectedTable, type StoredRow } from "./row-codec";
import { EncryptedStore, type EncryptionScope } from "./store";

const tables = (Object.keys(policies) as ProtectedTable[]).filter((table) => policies[table].encrypted.length > 0);
const blocked = tables.filter((table) => !schema[table].primaryKey.length ||
  schema[table].primaryKey.some((column) => (policies[table].encrypted as readonly string[]).includes(column)));
const material = randomBytes(32);
const codec = new EncryptedRowCodec(new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(material) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(material) }),
}));

beforeEach(() => vi.spyOn(console, "info").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("protected column serialization coverage (not a repository authorization test)", () => {
  it("keeps unsupported primary-key designs explicit instead of migrating under an invented identity", () => {
    expect(blocked).toEqual(["ai_decision_evaluations", "forge_mention_throttle", "pull_request_syncs"]);
  });

  it.each(tables.filter((table) => !blocked.includes(table)))("preserves every classified value in %s", async (table) => {
    const policy = policies[table];
    const row: StoredRow = { encryption_version: 0, encrypted_content: null };
    for (const column of schema[table].primaryKey) row[column] = `opaque-${column}`;
    let scope: EncryptionScope = { kind: "project", id: "project-fixture" };
    if ("column" in policy.scope) {
      scope = { kind: policy.scope.kind as EncryptionScope["kind"], id: "scope-fixture" };
      row[policy.scope.column] = scope.id;
    } else if ("id" in policy.scope) {
      scope = { kind: "system", id: policy.scope.id };
    } else if ("choices" in policy.scope) {
      const choice = policy.scope.choices[0];
      scope = { kind: choice.kind as EncryptionScope["kind"], id: "scope-fixture" };
      row[choice.column] = scope.id;
    }
    const definitions = schema[table].columns as Record<string, { type: string }>;
    for (const column of policy.encrypted) {
      row[column] = definitions[column].type.startsWith("json")
        ? { private: `${table}.${column}`, nested: [null, false, 3, { text: "Unicode fixture: 🔒" }] }
        : definitions[column].type.endsWith("[]")
          ? [`private ${table}.${column}`, "second value"]
          : `private ${table}.${column}: Unicode fixture 🔒`;
    }
    const encrypted = await codec.encode(row, { table, scope });
    for (const column of policy.encrypted) expect(encrypted[column]).toBeNull();
    expect(JSON.stringify(encrypted)).not.toContain("private");
    const decoded = await codec.decode(encrypted, { table, scope }, { actorId: null, reason: "migration_verification" });
    const { encryption_version: _version, encrypted_content: _content, ...expected } = row;
    if ("remove_projection" in policy.clear) {
      for (const column of policy.clear.remove_projection) delete decoded[column];
    }
    expect(decoded).toEqual(expected);
  });
});
