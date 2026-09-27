import "server-only";

import { randomUUID } from "node:crypto";
import { getEncryptedStore } from "./registry";

const MAGIC_V3 = "minddy-attachment-object-v3\n";
const MAGIC_V4 = "minddy-attachment-object-v4\n";
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 20 * 1024 * 1024;

export function attachmentObjectScope(path: string) {
  const parts = path.split("/");
  if (parts.length < 3 || !parts[1] || !parts[2] || path.includes("..")) {
    throw new Error("Invalid attachment object path");
  }
  const scope = parts[0] === "projects"
    ? { kind: "project" as const, id: parts[1] }
    : parts[0] === "chat"
      ? { kind: "user" as const, id: parts[1] }
      : null;
  if (!scope) throw new Error("Invalid attachment object scope");
  return scope;
}

function context(path: string, index: number, manifest?: Manifest) {
  const scope = attachmentObjectScope(path);
  return { scope, table: "attachment_objects", column: "bytes",
    rowId: manifest
      ? `${path}:${manifest.generation}:${manifest.length}:${manifest.count}:${index}`
      : `${path}:${index}` };
}

type Manifest = { length: number; count: number; generation: string };

export function attachmentObjectFormatVersion(bytes: Uint8Array): 0 | 3 | 4 {
  const prefix = Buffer.from(bytes).subarray(0, MAGIC_V4.length).toString("utf8");
  return prefix === MAGIC_V4 ? 4 : prefix === MAGIC_V3 ? 3 : 0;
}

export function isEncryptedAttachmentObject(bytes: Uint8Array): boolean {
  return attachmentObjectFormatVersion(bytes) !== 0;
}

export function attachmentObjectMetadata(bytes: Uint8Array): {
  format_version: 3 | 4; content_key_version: number;
} {
  const format = attachmentObjectFormatVersion(bytes);
  if (!format) throw new Error("Attachment object is not encrypted");
  const raw = Buffer.from(bytes).subarray(format === 4 ? MAGIC_V4.length : MAGIC_V3.length);
  const parsed = JSON.parse(raw.toString("utf8")) as { chunks?: unknown[]; manifest?: unknown };
  const envelope = JSON.parse(String(format === 4 ? parsed.manifest : parsed.chunks?.[0])) as {
    keyVersion?: unknown;
  };
  if (!Number.isSafeInteger(envelope.keyVersion) || Number(envelope.keyVersion) < 1) {
    throw new Error("Invalid attachment object key version");
  }
  return { format_version: format, content_key_version: Number(envelope.keyVersion) };
}

/** Encrypt up to the application limit in independently authenticated chunks. */
export async function encodeAttachmentObject(path: string,
  value: Uint8Array): Promise<Buffer> {
  if (value.byteLength > MAX_BYTES) throw new Error("Attachment object too large");
  const store = getEncryptedStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const chunks: string[] = [];
    const manifest: Manifest = { length: value.byteLength,
      count: Math.max(1, Math.ceil(value.byteLength / CHUNK_BYTES)),
      generation: randomUUID() };
    for (let offset = 0, index = 0; offset < value.byteLength || index === 0;
      offset += CHUNK_BYTES, index++) {
      const chunk = value.subarray(offset, Math.min(offset + CHUNK_BYTES, value.byteLength));
      chunks.push(await store.encryptBytes(chunk, context(path, index, manifest)));
    }
    const sealedManifest = await store.encrypt(manifest, context(path, -1));
    const keyVersion = store.versionOf(sealedManifest);
    if (chunks.every((chunk) => store.versionOf(store.fromDatabase<Uint8Array>(chunk)) ===
      keyVersion)) {
      return Buffer.from(MAGIC_V4 + JSON.stringify({ manifest: sealedManifest, chunks }));
    }
  }
  throw new Error("Attachment key rotated during encryption");
}

/** Fail closed on a malformed envelope, wrong path, missing key or bad chunk. */
export async function decodeAttachmentObject(path: string,
  value: Uint8Array): Promise<Buffer> {
  if (!isEncryptedAttachmentObject(value)) {
    throw new Error("Attachment object is not encrypted");
  }
  const format = attachmentObjectFormatVersion(value);
  const raw = Buffer.from(value).subarray(format === 4 ? MAGIC_V4.length : MAGIC_V3.length)
    .toString("utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" ||
      !Array.isArray((parsed as { chunks?: unknown }).chunks)) {
    throw new Error("Invalid attachment object envelope");
  }
  const store = getEncryptedStore();
  const untrustedManifest: unknown = format === 4
    ? await store.decrypt(store.fromDatabase<Manifest>((parsed as { manifest?: unknown }).manifest),
      context(path, -1))
    : { length: (parsed as { length?: unknown }).length,
      count: (parsed as { chunks: unknown[] }).chunks.length, generation: "" };
  if (!untrustedManifest || typeof untrustedManifest !== "object") {
    throw new Error("Invalid attachment object manifest");
  }
  const manifest = untrustedManifest as Manifest;
  if (!Number.isSafeInteger(manifest.length) || manifest.length < 0 ||
      manifest.length > MAX_BYTES || !Number.isSafeInteger(manifest.count) ||
      manifest.count !== Math.max(1, Math.ceil(manifest.length / CHUNK_BYTES)) ||
      (format === 4 && (typeof manifest.generation !== "string" ||
        !/^[0-9a-f-]{36}$/.test(manifest.generation)))) {
    throw new Error("Invalid attachment object manifest");
  }
  const { chunks } = parsed as { chunks: unknown[] };
  if (chunks.length !== manifest.count) {
    throw new Error("Invalid attachment object chunk count");
  }
  const clear: Buffer[] = [];
  const manifestVersion = format === 4
    ? store.versionOf(store.fromDatabase<Manifest>((parsed as { manifest: unknown }).manifest))
    : 0;
  for (const [index, serialized] of chunks.entries()) {
    if (typeof serialized !== "string") throw new Error("Invalid attachment chunk");
    const envelope = store.fromDatabase<Uint8Array>(serialized);
    if (format === 4 && store.versionOf(envelope) !== manifestVersion) {
      throw new Error("Attachment object key versions differ");
    }
    const chunk = await store.decryptBytes(envelope,
      context(path, index, format === 4 ? manifest : undefined));
    const expected = Math.min(CHUNK_BYTES, manifest.length - index * CHUNK_BYTES);
    if (chunk.byteLength !== expected) throw new Error("Attachment chunk size mismatch");
    clear.push(chunk);
  }
  return Buffer.concat(clear, manifest.length);
}
