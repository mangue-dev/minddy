import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { getBlindIndexKeys, getEncryptedStore } from
  "@/lib/server/encryption/registry";
import { blindIndex } from "@/lib/server/encryption/store";

type Column = "arguments" | "result" | "model_result";

function scope(userId: string) {
  if (!userId) throw new Error("Numo tool operation owner is required");
  return { kind: "user" as const, id: userId };
}

function binding(userId: string, turnId: string, callId: string, column: Column) {
  if (!turnId || !callId) throw new Error("Numo tool operation identity is required");
  return { scope: scope(userId), table: "numo_tool_operations", column,
    rowId: `${turnId}:${callId}` };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Invalid Numo tool operation value");
  return encoded;
}

export async function numoToolArgumentsDigest(userId: string, value: unknown) {
  const owner = scope(userId);
  const keys = getBlindIndexKeys();
  const current = await keys.current(owner);
  current.bytes.fill(0);
  const stable = await keys.byVersion(owner, 1);
  try {
    return blindIndex(canonical(value), { scope: owner,
      table: "numo_tool_operations", column: "arguments_digest" },
    stable.bytes);
  } finally {
    stable.bytes.fill(0);
  }
}

export async function encodeNumoToolOperationValue(userId: string,
  turnId: string, callId: string, column: Column, value: unknown) {
  if (value === undefined) throw new Error("Missing Numo tool operation value");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value,
    binding(userId, turnId, callId, column));
  return { value: JSON.parse(cipher) as Record<string, unknown>,
    version: store.versionOf(cipher) };
}

export async function decodeNumoToolOperationValue(userId: string,
  turnId: string, callId: string, column: Column, value: unknown,
  version: number, actorId: string | null = null): Promise<unknown> {
  if (!version) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid protected Numo tool operation");
  }
  const context = binding(userId, turnId, callId, column);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<unknown>(JSON.stringify(value));
  if (store.versionOf(cipher) !== version || store.formatOf(cipher) !== 3) {
    throw new Error("Numo tool operation key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}
