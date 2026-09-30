import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  calls: [] as string[],
}));
vi.mock("server-only", () => ({}));
vi.mock("./content-config", () => ({ isContentEncryptionEnabled: () => true }));
vi.mock("./backfill-attempt", () => ({ recordBackfillAttempt: async () => true }));
vi.mock("./registry", () => ({
  getContentKeys: () => ({ current: async () => ({ version: 1,
    bytes: Buffer.alloc(32) }) }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query = { select: () => query, order: () => query,
        limit: async () => ({ data: state.rows, error: null }) };
      return query;
    },
    rpc: async (name: string) => {
      state.calls.push(name);
      return { data: true, error: null };
    },
  }),
}));

const decode = async (...args: unknown[]) => {
  if (args.includes("corrupt")) throw new Error("authentication failed");
  return "private fixture";
};
vi.mock("@/lib/server/attachment-content", () => ({
  attachmentValueState: () => ({ version: 1, format: 3 }),
  decodeAttachmentValue: decode,
  encodeAttachmentValue: async () => "encrypted",
  isEncryptedAttachmentValue: () => true,
}));
vi.mock("@/lib/server/forge-relay/delivery-content", () => ({
  relayDeliveryState: () => ({ version: 1, format: 3 }),
  decodeRelayDelivery: decode,
  encodeRelayDelivery: async () => "encrypted",
  isEncryptedRelayDelivery: () => true,
}));
vi.mock("@/lib/server/agent/pr-comment-edit-content", () => ({
  prCommentEditState: () => ({ version: 1, format: 3 }),
  decodePrCommentEdit: decode,
  encodePrCommentEdit: async () => "encrypted",
  isEncryptedPrCommentEdit: () => true,
}));

const { backfillAttachmentMetadataBatch } = await import("./attachment-metadata-backfill");
const { backfillForgeRelayDeliveriesBatch } = await import("./forge-relay-delivery-backfill");
const { backfillPrCommentEditsBatch } = await import("./pr-comment-edit-backfill");

beforeEach(() => {
  state.rows = [];
  state.calls = [];
  vi.stubEnv("MINDDY_ATTACHMENT_METADATA_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_FORGE_RELAY_DELIVERY_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_PR_COMMENT_EDIT_ENCRYPTION_ENABLED", "true");
});

describe("authenticated current-format backfill checks", () => {
  it.each(["corrupt", "healthy"])("checks attachment ciphertext: %s", async (value) => {
    state.rows = [{ id: "attachment", project_id: "project",
      file_name: value, url: null, icon_data_url: null }];
    const result = await backfillAttachmentMetadataBatch("attachments", 1);
    expect(result).toMatchObject(value === "corrupt"
      ? { failed: 1, unchanged: 0 } : { failed: 0, unchanged: 1 });
    expect(state.calls).toEqual(value === "corrupt" ? [] : ["migrate_attachment_metadata"]);
  });

  it.each(["corrupt", "healthy"])("checks relay ciphertext: %s", async (value) => {
    state.rows = [{ id: "delivery", instance_id: "instance", provider: "github",
      delivery_guid: "guid", payload: value, last_error: null }];
    const result = await backfillForgeRelayDeliveriesBatch(1);
    expect(result).toMatchObject(value === "corrupt"
      ? { failed: 1, unchanged: 0 } : { failed: 0, unchanged: 1 });
    expect(state.calls).toEqual(value === "corrupt" ? [] : ["migrate_forge_relay_delivery_content"]);
  });

  it.each(["corrupt", "healthy"])("checks PR edit ciphertext: %s", async (value) => {
    state.rows = [{ id: "edit", body: value }];
    const result = await backfillPrCommentEditsBatch(1);
    expect(result).toMatchObject(value === "corrupt"
      ? { failed: 1, unchanged: 0 } : { failed: 0, unchanged: 1 });
    expect(state.calls).toEqual(value === "corrupt" ? [] : ["migrate_pr_comment_edit_body"]);
  });
});
