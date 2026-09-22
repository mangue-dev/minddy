import "server-only";

import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from "@aws-sdk/client-kms";

import type { EncryptionScope } from "./store";
import type { KeyWrapper, WrappedDataKey } from "./keys";

function encryptionContext(scope: EncryptionScope, purpose: "content" | "blind_index"): Record<string, string> {
  return {
    application: "minddy",
    purpose,
    scope_kind: scope.kind,
    scope_id: scope.id,
  };
}

/** The KEK stays in AWS KMS; only wrapped DEKs are persisted in Postgres. */
export class AwsKmsKeyWrapper implements KeyWrapper {
  private readonly client: KMSClient;

  constructor(
    private readonly keyId: string,
    region: string,
    private readonly purpose: "content" | "blind_index" = "content",
    client?: KMSClient,
  ) {
    if (!keyId || !region) throw new Error("KMS key ID and region are required");
    this.client = client ?? new KMSClient({ region });
  }

  async generate(scope: EncryptionScope): Promise<{
    bytes: Buffer;
    wrappedKey: Uint8Array;
  }> {
    const response = await this.client.send(new GenerateDataKeyCommand({
      KeyId: this.keyId,
      KeySpec: "AES_256",
      EncryptionContext: encryptionContext(scope, this.purpose),
    }));
    if (!response.Plaintext || response.Plaintext.length !== 32 ||
        !response.CiphertextBlob?.length) {
      response.Plaintext?.fill(0);
      throw new Error("KMS did not return a complete data key");
    }
    const bytes = Buffer.from(response.Plaintext);
    response.Plaintext.fill(0);
    return {
      bytes,
      wrappedKey: response.CiphertextBlob,
    };
  }

  async unwrap(record: WrappedDataKey): Promise<Buffer> {
    const response = await this.client.send(new DecryptCommand({
      KeyId: this.keyId,
      CiphertextBlob: record.wrappedKey,
      EncryptionContext: encryptionContext(record.scope, this.purpose),
    }));
    if (!response.Plaintext || response.Plaintext.length !== 32) {
      response.Plaintext?.fill(0);
      throw new Error("KMS did not return a complete data key");
    }
    const bytes = Buffer.from(response.Plaintext);
    response.Plaintext.fill(0);
    return bytes;
  }
}
