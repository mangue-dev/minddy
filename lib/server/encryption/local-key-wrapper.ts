import "server-only";

import { isValidDataRootKey, RootKeyCrypto } from "./root-key-crypto.mjs";
import type { KeyWrapper, WrappedDataKey } from "./keys";
import type { EncryptionScope } from "./store";

export function hasDataRootKey(): boolean {
  return isValidDataRootKey(process.env.MINDDY_DATA_ROOT_KEY);
}

/** Wraps independent random data keys with a root kept outside the database. */
export class LocalKeyWrapper implements KeyWrapper {
  private readonly crypto: RootKeyCrypto;

  constructor(purpose: "content" | "blind_index" = "content") {
    this.crypto = new RootKeyCrypto(process.env.MINDDY_DATA_ROOT_KEY, purpose);
  }

  generate(scope: EncryptionScope): Promise<{ bytes: Buffer; wrappedKey: Uint8Array }> {
    return this.crypto.generate(scope);
  }

  unwrap(record: WrappedDataKey): Promise<Buffer> {
    return this.crypto.unwrap(record);
  }
}
