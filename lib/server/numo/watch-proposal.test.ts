import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  createNumoWatch: vi.fn(),
  cancelNumoWatch: vi.fn(),
  restoreNumoWatch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: H.getProjectAccess }));
vi.mock("./watches", async (original) => ({
  ...await original<typeof import("./watches")>(),
  createNumoWatch: H.createNumoWatch,
  cancelNumoWatch: H.cancelNumoWatch,
  restoreNumoWatch: H.restoreNumoWatch,
}));

import { confirmNumoWatchProposal } from "./watch-proposal";
import { NumoWatchError } from "./watches";

const USER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PROPOSAL = "33333333-3333-4333-8333-333333333333";
const OLD = "44444444-4444-4444-8444-444444444444";
const service = {} as SupabaseClient;

const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: PROPOSAL, project_id: PROJECT, instruction: "Check the model costs",
  recurrence: { kind: "weekly", time: "09:00", weekday: 1 }, grants: ["administration"],
  timezone: "Europe/Paris", next_at: "2026-11-16T08:00:00.000Z", replaces: null, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.getProjectAccess.mockResolvedValue({ role: "member" });
  H.cancelNumoWatch.mockResolvedValue(true);
  H.createNumoWatch.mockImplementation(async (_service, userId, input) => ({ id: input.id, user_id: userId }));
});

/**
 * The confirmation is the user's own request, but the proposal travelled
 * through their browser: nothing in it is taken on trust.
 */
describe("confirmNumoWatchProposal (MIN-953)", () => {
  it("writes the reminder under the proposal's id, as a recurring reminder that acts", async () => {
    expect(await confirmNumoWatchProposal(service, USER, proposal())).toEqual({
      ok: true, watch: { id: PROPOSAL, user_id: USER },
    });
    expect(H.getProjectAccess).toHaveBeenCalledWith(USER, PROJECT);
    expect(H.createNumoWatch).toHaveBeenCalledWith(service, USER, expect.objectContaining({
      id: PROPOSAL, projectId: PROJECT, action: "act", instruction: "Check the model costs",
      recurrence: { kind: "weekly", time: "09:00", weekday: 1 }, grants: ["administration"],
      timezone: "Europe/Paris", conversationId: null,
    }));
  });

  it("refuses a proposal that is not one, before reading anything", async () => {
    for (const body of [null, "x", proposal({ grants: ["root"] }), proposal({ recurrence: { kind: "hourly" } }),
      proposal({ instruction: "x".repeat(501) }), proposal({ project_id: "mine" }), proposal({ timezone: "" })]) {
      expect(await confirmNumoWatchProposal(service, USER, body)).toEqual({ ok: false, status: 400, code: "invalid" });
    }
    expect(H.getProjectAccess).not.toHaveBeenCalled();
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });

  it("writes a personal reminder, which names no project, without any project check (MIN-982)", async () => {
    expect(await confirmNumoWatchProposal(service, USER, proposal({ project_id: null, grants: ["notification"] })))
      .toMatchObject({ ok: true });
    expect(H.getProjectAccess).not.toHaveBeenCalled();
    expect(H.createNumoWatch).toHaveBeenCalledWith(service, USER, expect.objectContaining({
      id: PROPOSAL, projectId: null, grants: ["notification"],
    }));
  });

  it("refuses a project the user cannot open", async () => {
    H.getProjectAccess.mockResolvedValue(null);
    expect(await confirmNumoWatchProposal(service, USER, proposal()))
      .toEqual({ ok: false, status: 404, code: "project_unavailable" });
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });

  it("writes once when the user confirms twice", async () => {
    H.createNumoWatch.mockRejectedValue(new NumoWatchError("conflict", "set"));
    expect(await confirmNumoWatchProposal(service, USER, proposal()))
      .toEqual({ ok: false, status: 409, code: "already_set" });
  });

  it("cancels the reminder it replaces, and puts it back when the new one is refused", async () => {
    expect((await confirmNumoWatchProposal(service, USER, proposal({ replaces: OLD }))).ok).toBe(true);
    expect(H.cancelNumoWatch).toHaveBeenCalledWith(service, USER, OLD);
    expect(H.restoreNumoWatch).not.toHaveBeenCalled();

    H.createNumoWatch.mockRejectedValue(new NumoWatchError("recurring_limit_reached", "full"));
    expect(await confirmNumoWatchProposal(service, USER, proposal({ replaces: OLD })))
      .toEqual({ ok: false, status: 409, code: "recurring_limit_reached" });
    expect(H.restoreNumoWatch).toHaveBeenCalledWith(service, USER, OLD);

    H.cancelNumoWatch.mockResolvedValue(false);
    H.createNumoWatch.mockClear();
    expect(await confirmNumoWatchProposal(service, USER, proposal({ replaces: OLD })))
      .toEqual({ ok: false, status: 404, code: "replaced_gone" });
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });
});
