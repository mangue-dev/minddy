import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

declare const encryptedBrand: unique symbol;

/** An opaque database value. Only the encrypted store can create it. */
export type Encrypted<T> = string & { readonly [encryptedBrand]: T };

export type EncryptionScope = {
  kind: "project" | "user" | "system";
  id: string;
};

export type EncryptionContext = {
  scope: EncryptionScope;
  table: string;
  column: string;
  rowId: string;
};

export type DataKey = {
  version: number;
  bytes: Buffer;
};

export interface DataKeyProvider {
  current(scope: EncryptionScope): Promise<DataKey>;
  byVersion(scope: EncryptionScope, version: number): Promise<DataKey>;
}

type Envelope = {
  format: 1 | 2;
  keyVersion: number;
  iv: string;
  tag: string;
  data: string;
};

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_ENVELOPE_BYTES = 16 * 1024 * 1024;

function aad(context: EncryptionContext, format: 1 | 2, keyVersion: number): Buffer {
  if (
    (context.scope.kind !== "project" && context.scope.kind !== "user" && context.scope.kind !== "system") ||
    !context.scope.id ||
    !context.table ||
    !context.column ||
    !context.rowId
  ) {
    throw new Error("An encryption context is required");
  }
  return Buffer.from(JSON.stringify([
    format === 1 ? "minddy-data-v1" : "minddy-data-v2",
    context.scope.kind,
    context.scope.id,
    context.table,
    context.column,
    context.rowId,
    ...(format === 2 ? [keyVersion] : []),
  ]));
}

function encoded(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function decoded(value: unknown, maxBytes: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maxBytes * 4 / 3) + 4 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new Error("Invalid encrypted value");
  }
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length > maxBytes || encoded(bytes) !== value) {
    throw new Error("Invalid encrypted value");
  }
  return bytes;
}

function parseEnvelope(value: string): Envelope {
  if (value.length > MAX_ENVELOPE_BYTES * 2) {
    throw new Error("Invalid encrypted value");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid encrypted value");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid encrypted value");
  }
  const envelope = parsed as Record<string, unknown>;
  if (
    (envelope.format !== 1 && envelope.format !== 2) ||
    !Number.isSafeInteger(envelope.keyVersion) ||
    (envelope.keyVersion as number) < 1
  ) {
    throw new Error("Invalid encrypted value");
  }
  if (decoded(envelope.iv, IV_BYTES).length !== IV_BYTES ||
      decoded(envelope.tag, TAG_BYTES).length !== TAG_BYTES) {
    throw new Error("Invalid encrypted value");
  }
  decoded(envelope.data, MAX_ENVELOPE_BYTES);
  return envelope as Envelope;
}

function assertKey(key: DataKey): void {
  if (!Number.isSafeInteger(key.version) || key.version < 1 ||
      !Buffer.isBuffer(key.bytes) || key.bytes.length !== KEY_BYTES) {
    throw new Error("Invalid data key");
  }
}

export class EncryptedStore {
  constructor(private readonly keys: DataKeyProvider) {}

  async encrypt<T>(value: T, context: EncryptionContext): Promise<Encrypted<T>> {
    const key = await this.keys.current(context.scope);
    try {
      assertKey(key);
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("Value cannot be serialized");
      const plaintext = Buffer.from(serialized, "utf8");
      if (plaintext.length > MAX_ENVELOPE_BYTES) {
        throw new Error("Value is too large to encrypt");
      }
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key.bytes, iv);
      cipher.setAAD(aad(context, 2, key.version));
      const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope: Envelope = {
        format: 2,
        keyVersion: key.version,
        iv: encoded(iv),
        tag: encoded(cipher.getAuthTag()),
        data: encoded(data),
      };
      return JSON.stringify(envelope) as Encrypted<T>;
    } finally {
      key.bytes.fill(0);
    }
  }

  async decrypt<T>(value: Encrypted<T>, context: EncryptionContext): Promise<T> {
    const envelope = parseEnvelope(value);
    const key = await this.keys.byVersion(context.scope, envelope.keyVersion);
    try {
      assertKey(key);
      if (key.version !== envelope.keyVersion) {
        throw new Error("Incorrect data key version");
      }
      const decipher = createDecipheriv("aes-256-gcm", key.bytes, decoded(envelope.iv, IV_BYTES));
      decipher.setAAD(aad(context, envelope.format, envelope.keyVersion));
      decipher.setAuthTag(decoded(envelope.tag, TAG_BYTES));
      const bytes = Buffer.concat([
        decipher.update(decoded(envelope.data, MAX_ENVELOPE_BYTES)),
        decipher.final(),
      ]);
      return JSON.parse(bytes.toString("utf8")) as T;
    } catch {
      throw new Error("Unable to decrypt data");
    } finally {
      key.bytes.fill(0);
    }
  }

  /** Check a database value before branding it as encrypted. */
  fromDatabase<T>(value: unknown): Encrypted<T> {
    if (typeof value !== "string") throw new Error("Invalid encrypted value");
    parseEnvelope(value);
    return value as Encrypted<T>;
  }

  versionOf<T>(value: Encrypted<T>): number {
    return parseEnvelope(value).keyVersion;
  }
}

/** Equality only. The search key must be distinct from every data key. */
export function blindIndex(
  normalizedValue: string,
  context: Omit<EncryptionContext, "rowId">,
  searchKey: Buffer,
): string {
  if (searchKey.length !== KEY_BYTES || !normalizedValue ||
      !context.scope.id || !context.table || !context.column) {
    throw new Error("Invalid blind index input");
  }
  return createHmac("sha256", searchKey)
    .update(JSON.stringify([
      "minddy-blind-index-v1",
      context.scope.kind,
      context.scope.id,
      context.table,
      context.column,
      normalizedValue,
    ]))
    .digest("hex");
}

export function normalizeEmailForIndex(email: string): string {
  // Match Auth lookup and invitation acceptance; Unicode composition can change identity.
  return email.trim().toLowerCase();
}
