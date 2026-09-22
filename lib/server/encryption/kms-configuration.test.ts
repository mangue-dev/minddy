import { describe, expect, it } from "vitest";
import template from "@/deploy/aws/data-encryption-kms.json";

describe("managed root-key configuration", () => {
  it("retains the root key across stack deletion and replacement and enables native rotation", () => {
    const key = template.Resources.DataEncryptionKey;
    expect(key.DeletionPolicy).toBe("Retain");
    expect(key.UpdateReplacePolicy).toBe("Retain");
    expect(key.Properties.EnableKeyRotation).toBe(true);
    expect(key.Properties.KeySpec).toBe("SYMMETRIC_DEFAULT");
  });

  it("limits the application grant to scoped envelope operations", () => {
    const grant = template.Resources.DataEncryptionKey.Properties.KeyPolicy.Statement
      .find((statement) => statement.Sid === "AllowApplicationEnvelopeOperations")!;
    expect(grant.Action).toEqual(["kms:GenerateDataKey", "kms:Decrypt"]);
    expect(grant.Principal).toEqual({ AWS: { Ref: "ApplicationRoleArn" } });
    expect(grant.Condition?.StringEquals["kms:EncryptionContext:application"]).toBe("minddy");
    expect(grant.Condition?.StringEquals["kms:EncryptionContext:purpose"]).toEqual(["content", "blind_index"]);
    expect(grant.Condition?.Null["kms:EncryptionContext:scope_id"]).toBe("false");
  });
});
