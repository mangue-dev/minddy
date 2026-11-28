import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { shouldEncryptPullRequestContent } from "@/lib/server/agent/pull-request-content";

/**
 * Codec of what a tracked commit or branch says in clear (MIN-1037): a commit's
 * title and author name, and a branch's name. This is repository content, like
 * the title and branches of a pull request, so it is sealed under the same
 * system scope and the same activation (`shouldEncryptPullRequestContent`).
 *
 * Each value is bound to its table, column and row: a ciphertext copied to
 * another row or column does not decrypt.
 */

export const COMMIT_CONTENT_FIELDS = ["title", "author_name"] as const;
export const BRANCH_CONTENT_FIELDS = ["branch"] as const;

export type CodeWorkTable = "issue_commits" | "issue_branches";

const PREFIX = "mdyc3";
const ENCODED = /^mdyc3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function binding(table: CodeWorkTable, column: string, id: string) {
  if (!id) throw new Error("Code work identity is required");
  return { scope: SCOPE, table, column, rowId: id };
}

export function isEncryptedCodeWorkContent(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

/** Whether new commit and branch content must be written sealed. */
export function shouldEncryptCodeWorkContent(): Promise<boolean> {
  return shouldEncryptPullRequestContent();
}

export async function encodeCodeWorkContent(table: CodeWorkTable, id: string,
  column: string, value: string): Promise<string> {
  if (!value || isEncryptedCodeWorkContent(value)) {
    throw new Error("Invalid code work content");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(table, column, id));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeCodeWorkContent(table: CodeWorkTable, id: string,
  column: string, value: string | null, actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedCodeWorkContent(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted code work content");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid code work content encoding");
  }
  const context = binding(table, column, id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Code work content key version mismatch");
  }
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string" || !plain) {
    throw new Error("Invalid code work content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

/** Key version and format of a sealed value, for the rotation worker. */
export function codeWorkContentState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted code work content");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Code work content key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

/**
 * Seals the clear fields of a row about to be written. `encrypt` is resolved
 * once by the caller for a whole batch (`shouldEncryptCodeWorkContent`).
 */
export async function encodeCodeWorkRow<T extends { id: string }>(
  table: CodeWorkTable, row: T, encrypt: boolean): Promise<T> {
  if (!encrypt) return row;
  const fields = table === "issue_commits" ? COMMIT_CONTENT_FIELDS : BRANCH_CONTENT_FIELDS;
  const result: Record<string, unknown> = { ...row };
  for (const column of fields) {
    const value = (row as Record<string, unknown>)[column];
    if (typeof value === "string" && value) {
      result[column] = await encodeCodeWorkContent(table, row.id, column, value);
    }
  }
  return result as T;
}

/** A stored row with its sealed fields read back in clear. */
export async function decodeCodeWorkRow<T extends { id: string }>(
  table: CodeWorkTable, row: T, actorId: string | null = null): Promise<T> {
  const fields = table === "issue_commits" ? COMMIT_CONTENT_FIELDS : BRANCH_CONTENT_FIELDS;
  const result: Record<string, unknown> = { ...row };
  for (const column of fields) {
    if (Object.hasOwn(row, column)) {
      result[column] = await decodeCodeWorkContent(table, row.id, column,
        (row as Record<string, unknown>)[column] as string | null, actorId);
    }
  }
  return result as T;
}
