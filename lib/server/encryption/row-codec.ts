import "server-only";

import policies from "./data-policy.json";
import schema from "@/docs/security/encryption/schema.json";
import { auditDecryption, type DecryptAudit } from "./audit";
import { EncryptedStore, type Encrypted, type EncryptionScope } from "./store";

export type ProtectedTable = keyof typeof policies;
type Content = Record<string, unknown>;
export type StoredRow = Record<string, unknown> & {
  encryption_version: number;
  encrypted_content: Encrypted<Content> | null;
};

export type RowContext = { table: ProtectedTable; scope: EncryptionScope };

function context(row: StoredRow, input: RowContext) {
  if (!Object.hasOwn(policies, input.table)) throw new Error("Unclassified encrypted table");
  const rule = policies[input.table];
  const primaryKey: readonly string[] = schema[input.table].primaryKey;
  // A separate, movable encryption ID would allow ciphertext transplantation.
  if (!primaryKey.length || primaryKey.some((column) =>
    (rule.encrypted as readonly string[]).includes(column) ||
    !Object.hasOwn(row, column) ||
    !(typeof row[column] === "string" && row[column].length > 0 ||
      typeof row[column] === "number" && Number.isSafeInteger(row[column])))) {
    throw new Error("A complete, non-sensitive primary key is required");
  }
  const scope = rule.scope;
  if ("column" in scope && (row[scope.column] !== input.scope.id || scope.kind !== input.scope.kind)) {
    throw new Error("Encryption scope does not match row ownership");
  }
  if ("id" in scope && (input.scope.kind !== scope.kind || input.scope.id !== scope.id)) {
    throw new Error("Encryption scope does not match system ownership");
  }
  if ("choices" in scope) {
    const owner = scope.choices.find((choice) => row[choice.column] != null);
    if (!owner || owner.kind !== input.scope.kind || row[owner.column] !== input.scope.id) {
      throw new Error("Encryption scope does not match row ownership");
    }
  }
  return { ...input, column: "encrypted_content", rowId: JSON.stringify(primaryKey.map((column) => row[column])) };
}

function contentColumns(table: ProtectedTable): readonly string[] {
  const columns = policies[table].encrypted;
  if (!columns.length) throw new Error("Table has no protected content");
  return columns;
}

/** Encode complete repository rows; partial writes must merge under a revision check. */
export class EncryptedRowCodec {
  constructor(private readonly store: EncryptedStore) {}

  async encode(row: StoredRow, input: RowContext): Promise<StoredRow> {
    const cryptoContext = context(row, input);
    const columns = contentColumns(input.table);
    const payload: Content = {};
    const result = { ...row };
    for (const column of columns) {
      if (!Object.hasOwn(row, column) || row[column] === undefined) {
        throw new Error(`Incomplete protected row: ${input.table}.${column}`);
      }
      payload[column] = row[column];
      result[column] = null;
    }
    // Search projections must not preserve plaintext after the source is encrypted.
    const clear = policies[input.table].clear;
    if ("remove_projection" in clear) {
      for (const column of clear.remove_projection) {
        const definition = schema[input.table].columns as Record<string, { generated: boolean }>;
        if (definition[column].generated) delete result[column];
        else result[column] = null;
      }
    }
    const encrypted = await this.store.encrypt(payload, cryptoContext);
    result.encrypted_content = encrypted;
    result.encryption_version = this.store.versionOf(encrypted);
    return result;
  }

  async decode(row: StoredRow, input: RowContext, audit: DecryptAudit): Promise<Record<string, unknown>> {
    const cryptoContext = context(row, input);
    const columns = contentColumns(input.table);
    if (!Number.isSafeInteger(row.encryption_version) || row.encryption_version < 0) {
      throw new Error("Invalid row encryption version");
    }
    let content: Content = {};
    if (row.encryption_version === 0) {
      if (row.encrypted_content !== null) throw new Error("Inconsistent legacy row encryption state");
      if (columns.some((column) => !Object.hasOwn(row, column) || row[column] === undefined)) {
        throw new Error("Incomplete legacy row content");
      }
    } else {
      if (columns.some((column) => row[column] !== null)) {
        throw new Error("Encrypted row retains plaintext content");
      }
      const clear = policies[input.table].clear;
      if ("remove_projection" in clear && clear.remove_projection.some((column) =>
        row[column] != null && row[column] !== "")) {
        throw new Error("Encrypted row retains a plaintext search projection");
      }
      const value = this.store.fromDatabase<Content>(row.encrypted_content);
      if (this.store.versionOf(value) !== row.encryption_version) {
        throw new Error("Inconsistent row encryption version");
      }
      content = await this.store.decrypt(value, cryptoContext);
      if (!content || typeof content !== "object" || Array.isArray(content) ||
        Object.keys(content).length !== columns.length ||
        columns.some((column) => !Object.hasOwn(content, column))) {
        throw new Error("Invalid protected row content");
      }
    }
    const result: Record<string, unknown> = { ...row, ...content };
    delete result.encrypted_content;
    delete result.encryption_version;
    auditDecryption(cryptoContext, audit);
    return result;
  }
}
