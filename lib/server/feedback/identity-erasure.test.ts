import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ service: vi.fn(), decode: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.service }));
vi.mock("./identity-content", () => ({
  decodeFeedbackIdentityRow: h.decode,
  encodeFeedbackIdentity: vi.fn(),
  feedbackIdentityLookup: vi.fn(),
  shouldProtectFeedbackIdentity: vi.fn(),
}));

import { createFeedbackSession, getFeedbackSession, upsertFeedbackUser } from "./identity";

function sessionService(erasedAt: string | null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: {
    id: "session-id", board_id: "board-id",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    feedback_users: {
      id: "user-id", project_id: "project-id", external_id: null,
      email: null, name: null, pseudonym: "Quiet Bird", verified_via: "email",
      erased_at: erasedAt,
    },
  } });
  const insert = vi.fn(async () => ({
    error: erasedAt ? { message: "MIN591_PRIVATE_DATABASE_DETAIL" } : null,
  }));
  return { from: vi.fn(() => ({ ...query, insert })) };
}

beforeEach(() => {
  h.service.mockReset();
  h.decode.mockReset().mockImplementation(async (row) => row);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("erased feedback identities", () => {
  it("rejects a surviving session row for an erased identity", async () => {
    h.service.mockReturnValue(sessionService("2026-09-27T00:00:00Z"));
    expect(await getFeedbackSession("board-id", "fbs_token")).toBeNull();
    expect(h.decode).not.toHaveBeenCalled();
  });

  it("does not log database details when session creation is rejected", async () => {
    h.service.mockReturnValue(sessionService("2026-09-27T00:00:00Z"));
    expect(await createFeedbackSession({ boardId: "board-id", userId: "user-id" }))
      .toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls))
      .not.toContain("MIN591_PRIVATE_DATABASE_DETAIL");
  });

  it("does not log database details on identity insert failure", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
      insert: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null,
        error: { code: "42501", message: "MIN591_PRIVATE_DATABASE_DETAIL" } });
    query.insert.mockReturnValue(query);
    h.service.mockReturnValue({ from: vi.fn(() => query) });
    expect(await upsertFeedbackUser({ projectId: "project-id",
      email: "private@example.test", verifiedVia: "email" })).toBeNull();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls))
      .not.toContain("MIN591_PRIVATE_DATABASE_DETAIL");
  });
});
