import "server-only";

import { getEncryptedStore } from "@/lib/server/encryption/registry";

/**
 * Codec of the OpenRouter keys Minddy Cloud issues per account (MIN-761).
 *
 * The secret is always sealed in the system scope, whatever the content
 * encryption rollout state: the table is new, has no plaintext history, and
 * only exists on a Cloud deployment, which holds the data root key. The key
 * hash binds each ciphertext to its row.
 */

const scope = { kind: "system" as const, id: "00000000-0000-0000-0000-000000000000" };

function context(keyHash: string) {
  if (!keyHash) throw new Error("Missing managed AI key hash");
  return { scope, table: "managed_ai_keys", column: "key_encrypted", rowId: keyHash };
}

export async function encodeManagedAiKey(key: string, keyHash: string): Promise<string> {
  if (!key) throw new Error("Empty managed AI key");
  return getEncryptedStore().encrypt(key, context(keyHash));
}

export async function decodeManagedAiKey(value: string, keyHash: string): Promise<string> {
  const store = getEncryptedStore();
  const key = await store.decrypt<string>(store.fromDatabase<string>(value), context(keyHash));
  if (typeof key !== "string" || !key) throw new Error("Invalid managed AI key content");
  return key;
}
