import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ service: vi.fn(), decode: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.service }));
vi.mock("@/lib/server/feedback/boards", () => ({
  getBoardForProject: vi.fn(async () => null),
}));
vi.mock("./identity-content", () => ({
  decodeFeedbackIdentityRow: h.decode,
  feedbackOtpEmailLookup: vi.fn(),
  shouldProtectFeedbackIdentity: vi.fn(),
}));

import { eraseFeedbackUser } from "./erasure";

const projectId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";

function fakeService(erasedAt: string | null, sessionError: string | null) {
  const userQuery = {
    select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({
      data: { id: userId, project_id: projectId, email: "private@example.test",
        erased_at: erasedAt }, error: null,
    })), update: vi.fn(),
  };
  userQuery.select.mockReturnValue(userQuery);
  userQuery.eq.mockReturnValue(userQuery);
  userQuery.update.mockReturnValue(userQuery);
  const sessionQuery = { delete: vi.fn(), eq: vi.fn(async () => ({
    count: 0, error: sessionError ? { message: sessionError } : null,
  })) };
  sessionQuery.delete.mockReturnValue(sessionQuery);
  const countQuery = { select: vi.fn(), eq: vi.fn(async () => ({ count: 0 })) };
  countQuery.select.mockReturnValue(countQuery);
  const rpc = vi.fn(async () => ({
    data: sessionError ? null : [{ already_erased: !!erasedAt, sessions_revoked: 0 }],
    error: sessionError ? { message: sessionError } : null,
  }));
  return { from: vi.fn((table: string) => {
    if (table === "feedback_users") return userQuery;
    if (table === "feedback_sessions") return sessionQuery;
    return countQuery;
  }), rpc };
}

beforeEach(() => {
  h.service.mockReset();
  h.decode.mockReset().mockImplementation(async (row) => row);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("feedback erasure session revocation", () => {
  it("fails rather than reporting erasure when session deletion fails", async () => {
    h.service.mockReturnValue(fakeService(null, "MIN591_PRIVATE_SESSION_ERROR"));
    expect(await eraseFeedbackUser({ projectId, userId }))
      .toEqual({ ok: false, error: "failed" });
  });

  it("retries session revocation for an identity already marked erased", async () => {
    const service = fakeService("2026-09-27T00:00:00Z", null);
    h.service.mockReturnValue(service);
    expect((await eraseFeedbackUser({ projectId, userId })).ok).toBe(true);
    expect(service.rpc).toHaveBeenCalledWith("erase_feedback_identity", {
      p_project_id: projectId, p_user_id: userId, p_email_plain: null,
    });
  });

  it("fails closed when the identity key needed for legacy OTP cleanup is missing", async () => {
    const service = fakeService(null, null);
    h.service.mockReturnValue(service);
    h.decode.mockRejectedValue(new Error("historical key unavailable"));
    expect(await eraseFeedbackUser({ projectId, userId }))
      .toEqual({ ok: false, error: "failed" });
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
