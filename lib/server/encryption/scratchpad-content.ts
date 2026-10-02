import "server-only";

import { getEncryptedStore } from "./registry";
import { EncryptedRowCodec } from "./row-codec";
import { isContentEncryptionEnabled } from "./content-config";

const context = (userId: string) => ({ table: "user_scratchpad" as const, scope: { kind: "user" as const, id: userId } });

export async function decodeScratchpadRow(row: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
  if (row.user_id !== undefined && row.user_id !== userId) throw new Error("Invalid scratchpad owner");
  // A preview can read the old schema, but partially present encryption state is an error.
  if (row.encryption_version === undefined && row.encrypted_content === undefined) {
    if (typeof row.content !== "string") throw new Error("Invalid legacy scratchpad content");
    return row;
  }
  if (row.encryption_version === 0 && row.encrypted_content === null) {
    if (typeof row.content !== "string") throw new Error("Invalid legacy scratchpad content");
    const { encryption_version: _version, encrypted_content: _ciphertext, ...plain } = row;
    return plain;
  }
  if (typeof row.encryption_version !== "number" || !Number.isSafeInteger(row.encryption_version) || row.encryption_version < 1) {
    throw new Error("Invalid scratchpad encryption state");
  }
  const store = getEncryptedStore();
  const codec = new EncryptedRowCodec(store);
  const decoded = await codec.decode({
    ...row, user_id: userId, encryption_version: row.encryption_version,
    encrypted_content: store.fromDatabase<Record<string, unknown>>(row.encrypted_content),
  }, context(userId), {
    actorId: userId, reason: "repository_read",
  });
  if (typeof decoded.content !== "string") throw new Error("Invalid scratchpad content");
  return decoded;
}

export async function encodeScratchpadContent(content: string, userId: string, previousVersion: unknown) {
  if (!isContentEncryptionEnabled() && !(typeof previousVersion === "number" && previousVersion > 0)) {
    return { content };
  }
  const codec = new EncryptedRowCodec(getEncryptedStore());
  const saved = await codec.encode({
    user_id: userId, content, encryption_version: 0, encrypted_content: null,
  }, context(userId));
  return { content: null, encrypted_content: saved.encrypted_content, encryption_version: saved.encryption_version };
}
