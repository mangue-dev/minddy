import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 47);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) =>
    ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({
    current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope: unknown, version: number) =>
      ({ version, bytes: Buffer.from(key) }),
  }),
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));
const h = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.service }));

import { encodeFeedbackIdentity, feedbackIdentityLookup,
  feedbackOtpEmailLookup } from "./identity-content";
import { eraseFeedbackUser } from "./erasure";

const projectId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

describe("feedback erasure with real identity codecs", () => {
  it("passes the independent OTP digest while keeping the project digest private", async () => {
    const email = "private@example.test";
    const identityLookup = await feedbackIdentityLookup(projectId, "email", email);
    const otpLookup = await feedbackOtpEmailLookup(email);
    expect(identityLookup).not.toBe(otpLookup);
    const cipher = await encodeFeedbackIdentity(projectId, userId, "email", email);
    const userQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({
      data: { id: userId, project_id: projectId, email: cipher,
        email_lookup: identityLookup, erased_at: null }, error: null,
    })) };
    userQuery.select.mockReturnValue(userQuery);
    userQuery.eq.mockReturnValue(userQuery);
    const countQuery = { select: vi.fn(), eq: vi.fn(async () => ({
      count: 0, error: null,
    })) };
    countQuery.select.mockReturnValue(countQuery);
    const rpc = vi.fn(async () => ({
      data: [{ already_erased: false, sessions_revoked: 0 }], error: null,
    }));
    h.service.mockReturnValue({ from: (table: string) => table === "feedback_users"
      ? userQuery : countQuery, rpc });

    expect((await eraseFeedbackUser({ projectId, userId })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("erase_feedback_identity", {
      p_project_id: projectId, p_user_id: userId,
      p_email_plain: email, p_otp_email_lookup: otpLookup,
    });
  });
});
