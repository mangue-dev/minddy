import {
  DecryptCommand,
  GenerateDataKeyCommand,
  type KMSClient,
} from "@aws-sdk/client-kms";
import { describe, expect, it } from "vitest";

import { AwsKmsKeyWrapper } from "./aws-kms";

describe("AwsKmsKeyWrapper", () => {
  it("binds KMS operations to scope and purpose and clears the response buffer", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const generatedPlaintext = new Uint8Array(32).fill(7);
    const decryptedPlaintext = new Uint8Array(32).fill(7);
    const client = {
      async send(command: GenerateDataKeyCommand | DecryptCommand) {
        calls.push(command.input as Record<string, unknown>);
        if (command instanceof GenerateDataKeyCommand) {
          return {
            Plaintext: generatedPlaintext,
            CiphertextBlob: new Uint8Array([1, 2, 3]),
          };
        }
        return { Plaintext: decryptedPlaintext };
      },
    } as unknown as KMSClient;
    const wrapper = new AwsKmsKeyWrapper("kms-key", "eu-west-1", "blind_index", client);
    const scope = { kind: "project", id: "tenant-id" } as const;

    const generated = await wrapper.generate(scope);
    expect(generated.bytes).toEqual(Buffer.alloc(32, 7));
    expect(generatedPlaintext).toEqual(new Uint8Array(32));
    expect(await wrapper.unwrap({
      scope,
      version: 1,
      wrappedKey: generated.wrappedKey,
    })).toEqual(Buffer.alloc(32, 7));
    expect(decryptedPlaintext).toEqual(new Uint8Array(32));
    expect(calls).toHaveLength(2);
    expect(calls[0].EncryptionContext).toEqual({
      application: "minddy",
      purpose: "blind_index",
      scope_kind: "project",
      scope_id: "tenant-id",
    });
    expect(calls[1].EncryptionContext).toEqual(calls[0].EncryptionContext);
  });
});
