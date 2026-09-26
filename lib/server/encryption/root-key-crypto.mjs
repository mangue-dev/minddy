import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const FORMAT = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const DATA_KEY_BYTES = 32;
const WRAPPED_BYTES = 1 + NONCE_BYTES + TAG_BYTES + DATA_KEY_BYTES;

export function isValidDataRootKey(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

function associatedData(scope, purpose) {
  if (!["project", "user", "system"].includes(scope?.kind) || !scope.id) {
    throw new Error("Invalid encryption scope");
  }
  return Buffer.from(JSON.stringify(["minddy", "data-key", FORMAT, purpose, scope.kind, scope.id]));
}

/** Shared by the server wrapper and the offline root-key rewrap command. */
export class RootKeyCrypto {
  constructor(rootHex, purpose = "content") {
    if (!isValidDataRootKey(rootHex)) {
      throw new Error("MINDDY_DATA_ROOT_KEY must be a 32-byte hex key");
    }
    if (purpose !== "content" && purpose !== "blind_index") {
      throw new Error("Invalid data key purpose");
    }
    this.purpose = purpose;
    const root = Buffer.from(rootHex, "hex");
    try {
      this.wrappingKey = Buffer.from(hkdfSync("sha256", root,
        Buffer.from("minddy:data-key-root:v1"), Buffer.from(purpose), DATA_KEY_BYTES));
    } finally {
      root.fill(0);
    }
  }

  wrap(scope, bytes) {
    if (!Buffer.isBuffer(bytes) || bytes.length !== DATA_KEY_BYTES) {
      throw new Error("Invalid data key length");
    }
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.wrappingKey, nonce);
    cipher.setAAD(associatedData(scope, this.purpose));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.concat([Buffer.from([FORMAT]), nonce, cipher.getAuthTag(), ciphertext]);
  }

  async generate(scope) {
    const bytes = randomBytes(DATA_KEY_BYTES);
    try {
      return { bytes, wrappedKey: this.wrap(scope, bytes) };
    } catch {
      bytes.fill(0);
      throw new Error("Unable to generate data key");
    }
  }

  async unwrap(record) {
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
