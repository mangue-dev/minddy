import "server-only";

import { getEncryptedStore } from "./registry";

const MAGIC = "minddy-attachment-object-v3\n";
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

function context(path: string, index: number) {
  const scope = attachmentObjectScope(path);
  return { scope, table: "attachment_objects", column: "bytes",
    rowId: `${path}:${index}` };
}

export function isEncryptedAttachmentObject(bytes: Uint8Array): boolean {
  return Buffer.from(bytes).subarray(0, MAGIC.length).toString("utf8") === MAGIC;
}

/** Encrypt up to the application limit in independently authenticated chunks. */
export async function encodeAttachmentObject(path: string,
  value: Uint8Array): Promise<Buffer> {
  if (value.byteLength > MAX_BYTES) throw new Error("Attachment object too large");
  const chunks: string[] = [];
  const store = getEncryptedStore();
  for (let offset = 0, index = 0; offset < value.byteLength || index === 0;
    offset += CHUNK_BYTES, index++) {
    const chunk = value.subarray(offset, Math.min(offset + CHUNK_BYTES, value.byteLength));
    chunks.push(await store.encryptBytes(chunk, context(path, index)));
  }
  return Buffer.from(MAGIC + JSON.stringify({ length: value.byteLength, chunks }));
}

/** Fail closed on a malformed envelope, wrong path, missing key or bad chunk. */
export async function decodeAttachmentObject(path: string,
  value: Uint8Array): Promise<Buffer> {
  if (!isEncryptedAttachmentObject(value)) {
    throw new Error("Attachment object is not encrypted");
  }
  const raw = Buffer.from(value).subarray(MAGIC.length).toString("utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" ||
      !Number.isSafeInteger((parsed as { length?: unknown }).length) ||
      Number((parsed as { length: number }).length) < 0 ||
      Number((parsed as { length: number }).length) > MAX_BYTES ||
      !Array.isArray((parsed as { chunks?: unknown }).chunks)) {
    throw new Error("Invalid attachment object envelope");
  }
  const { length, chunks } = parsed as { length: number; chunks: unknown[] };
  if (chunks.length !== Math.max(1, Math.ceil(length / CHUNK_BYTES))) {
    throw new Error("Invalid attachment object chunk count");
  }
  const store = getEncryptedStore();
  const clear: Buffer[] = [];
  for (const [index, serialized] of chunks.entries()) {
    if (typeof serialized !== "string") throw new Error("Invalid attachment chunk");
    const chunk = await store.decryptBytes(store.fromDatabase<Uint8Array>(serialized),
      context(path, index));
    const expected = Math.min(CHUNK_BYTES, length - index * CHUNK_BYTES);
    if (chunk.byteLength !== expected) throw new Error("Attachment chunk size mismatch");
    clear.push(chunk);
  }
  return Buffer.concat(clear, length);
}
