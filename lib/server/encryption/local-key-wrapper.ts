import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import type { KeyWrapper, WrappedDataKey } from "./keys";
import type { EncryptionScope } from "./store";

const FORMAT = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const DATA_KEY_BYTES = 32;
const WRAPPED_BYTES = 1 + NONCE_BYTES + TAG_BYTES + DATA_KEY_BYTES;

export function hasDataRootKey(): boolean {
  return typeof process.env.MINDDY_DATA_ROOT_KEY === "string" &&
    /^[a-fA-F0-9]{64}$/.test(process.env.MINDDY_DATA_ROOT_KEY);
}

function rootKey(): Buffer {
  if (!hasDataRootKey()) {
    throw new Error("MINDDY_DATA_ROOT_KEY must be a 32-byte hex key");
  }
  return Buffer.from(process.env.MINDDY_DATA_ROOT_KEY!, "hex");
}

function associatedData(scope: EncryptionScope, purpose: "content" | "blind_index"): Buffer {
  if (!["project", "user", "system"].includes(scope.kind) || !scope.id) {
    throw new Error("Invalid encryption scope");
  }
  return Buffer.from(JSON.stringify(["minddy", "data-key", FORMAT, purpose, scope.kind, scope.id]));
}

/** Wraps independent random data keys with a root kept outside the database. */
export class LocalKeyWrapper implements KeyWrapper {
  private readonly wrappingKey: Buffer;

  constructor(private readonly purpose: "content" | "blind_index" = "content") {
    const root = rootKey();
    try {
      this.wrappingKey = Buffer.from(hkdfSync("sha256", root,
        Buffer.from("minddy:data-key-root:v1"), Buffer.from(purpose), DATA_KEY_BYTES));
    } finally {
      root.fill(0);
    }
  }

  async generate(scope: EncryptionScope): Promise<{ bytes: Buffer; wrappedKey: Uint8Array }> {
    const aad = associatedData(scope, this.purpose);
    const bytes = randomBytes(DATA_KEY_BYTES);
    const nonce = randomBytes(NONCE_BYTES);
    try {
      const cipher = createCipheriv("aes-256-gcm", this.wrappingKey, nonce);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return {
        bytes,
        wrappedKey: Buffer.concat([Buffer.from([FORMAT]), nonce, cipher.getAuthTag(), ciphertext]),
      };
    } catch {
      bytes.fill(0);
      throw new Error("Unable to generate data key");
    }
  }

  async unwrap(record: WrappedDataKey): Promise<Buffer> {
    const wrapped = Buffer.from(record.wrappedKey);
    if (wrapped.length !== WRAPPED_BYTES || wrapped[0] !== FORMAT) {
      throw new Error("Invalid wrapped data key");
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.wrappingKey,
        wrapped.subarray(1, 1 + NONCE_BYTES));
      decipher.setAAD(associatedData(record.scope, this.purpose));
      decipher.setAuthTag(wrapped.subarray(1 + NONCE_BYTES, 1 + NONCE_BYTES + TAG_BYTES));
      const bytes = Buffer.concat([decipher.update(wrapped.subarray(1 + NONCE_BYTES + TAG_BYTES)), decipher.final()]);
      if (bytes.length !== DATA_KEY_BYTES) throw new Error("Invalid data key length");
      return bytes;
    } catch {
      throw new Error("Unable to unwrap data key");
    }
  }
}
