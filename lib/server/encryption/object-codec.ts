import "server-only";

import { createHash } from "node:crypto";
import { auditDecryption, type DecryptAudit } from "./audit";
import { EncryptedStore, type Encrypted, type EncryptionContext, type EncryptionScope } from "./store";

declare const objectBrand: unique symbol;
export type EncryptedObject = Buffer & { readonly [objectBrand]: true };
export type ObjectContext = { scope: EncryptionScope; bucket: string; path: string };
export type ObjectMetadata = { fileName: string; mimeType: string };
type Part = { sha256: string; size: number };
type Manifest = ObjectMetadata & { size: number; parts: Part[] };
type Container = { format: "minddy-object-v1"; manifest: Encrypted<Manifest>; chunks: Encrypted<Uint8Array>[] };

export const MAX_PROTECTED_OBJECT_BYTES = 20 * 1024 * 1024;
const CHUNK_BYTES = 1024 * 1024;
const MAX_PARTS = MAX_PROTECTED_OBJECT_BYTES / CHUNK_BYTES;
const MAX_CONTAINER_BYTES = 30 * 1024 * 1024;

function cryptoContext(input: ObjectContext, column: string): EncryptionContext {
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(input.bucket) ||
      !input.path || input.path.length > 1024 || input.path.includes("\\") ||
      input.path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid protected object location");
  }
  return { scope: input.scope, table: "storage.objects", rowId: `${input.bucket}/${input.path}`, column };
}

function validMetadata(value: ObjectMetadata): boolean {
  return typeof value.fileName === "string" && value.fileName.length > 0 && value.fileName.length <= 200 &&
    !/[\r\n\0]/.test(value.fileName) && typeof value.mimeType === "string" &&
    value.mimeType.length > 0 && value.mimeType.length <= 120 && !/[\r\n\0]/.test(value.mimeType);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Authenticated object bytes and metadata use the same crypto boundary as rows.
 * A manifest binds every chunk, preventing truncation, reordering and replacement
 * with an older chunk from the same path. Repositories must authorize the scope
 * and choose an opaque, immutable path before calling this codec.
 */
export class EncryptedObjectCodec {
  constructor(private readonly store: EncryptedStore) {}

  async encode(bytes: Uint8Array, input: ObjectContext, metadata: ObjectMetadata): Promise<EncryptedObject> {
    const manifestContext = cryptoContext(input, "manifest");
    if (bytes.byteLength > MAX_PROTECTED_OBJECT_BYTES) throw new Error("Protected object is too large");
    if (!validMetadata(metadata)) throw new Error("Invalid protected object metadata");
    const chunks: Encrypted<Uint8Array>[] = [];
    const parts: Part[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
      const source = Buffer.from(bytes.buffer, bytes.byteOffset + offset, Math.min(CHUNK_BYTES, bytes.byteLength - offset));
      const encrypted = await this.store.encryptBytes(source, cryptoContext(input, `chunk:${chunks.length}`));
      chunks.push(encrypted);
      parts.push({ sha256: hash(encrypted), size: source.byteLength });
    }
    const manifest = await this.store.encrypt<Manifest>({ ...metadata, size: bytes.byteLength, parts }, manifestContext);
    const container: Container = { format: "minddy-object-v1", manifest, chunks };
    return Buffer.from(JSON.stringify(container)) as EncryptedObject;
  }

  fromStorage(value: Uint8Array): EncryptedObject {
    if (value.byteLength > MAX_CONTAINER_BYTES) throw new Error("Protected object container is too large");
    this.parse(value);
    return Buffer.from(value) as EncryptedObject;
  }

  private parse(bytes: Uint8Array): Container {
    if (bytes.byteLength > MAX_CONTAINER_BYTES) throw new Error("Protected object container is too large");
    let value: unknown;
    try { value = JSON.parse(Buffer.from(bytes).toString("utf8")); }
    catch { throw new Error("Invalid protected object container"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid protected object container");
    const container = value as Record<string, unknown>;
    if (container.format !== "minddy-object-v1" || !Array.isArray(container.chunks) ||
        container.chunks.length > MAX_PARTS) throw new Error("Invalid protected object container");
    return {
      format: "minddy-object-v1",
      manifest: this.store.fromDatabase<Manifest>(container.manifest),
      chunks: container.chunks.map((part) => this.store.fromDatabase<Uint8Array>(part)),
    };
  }

  async decode(value: EncryptedObject, input: ObjectContext, audit: DecryptAudit): Promise<{
    bytes: Buffer; metadata: ObjectMetadata;
  }> {
    const context = cryptoContext(input, "manifest");
    const container = this.parse(value);
    const manifest = await this.store.decrypt(container.manifest, context);
    if (!manifest || typeof manifest !== "object" || !validMetadata(manifest) ||
        !Number.isSafeInteger(manifest.size) || manifest.size < 0 || manifest.size > MAX_PROTECTED_OBJECT_BYTES ||
        !Array.isArray(manifest.parts) || manifest.parts.length !== container.chunks.length ||
        manifest.parts.length !== Math.ceil(manifest.size / CHUNK_BYTES)) {
      throw new Error("Invalid protected object manifest");
    }
    const output = Buffer.alloc(manifest.size);
    try {
      for (let index = 0; index < manifest.parts.length; index += 1) {
        const part = manifest.parts[index];
        const expectedSize = Math.min(CHUNK_BYTES, manifest.size - index * CHUNK_BYTES);
        if (!part || part.size !== expectedSize || part.sha256 !== hash(container.chunks[index])) {
          throw new Error("Protected object chunk does not match manifest");
        }
        const bytes = await this.store.decryptBytes(container.chunks[index], cryptoContext(input, `chunk:${index}`));
        try {
          if (bytes.byteLength !== expectedSize) throw new Error("Invalid protected object chunk");
          bytes.copy(output, index * CHUNK_BYTES);
        } finally { bytes.fill(0); }
      }
      auditDecryption(context, audit);
      return { bytes: output, metadata: { fileName: manifest.fileName, mimeType: manifest.mimeType } };
    } catch (error) {
      output.fill(0);
      throw error;
    }
  }
}
