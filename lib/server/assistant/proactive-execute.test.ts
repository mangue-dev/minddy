import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `executeTool` routes every call of a background turn through the guard
 * (MIN-929) before the tool runs, and only there: a conversation is not
 * guarded. An urgent note is flagged only once the guard accepted it.
 */

const H = vi.hoisted(() => ({
  guard: vi.fn(),
  sendNumoNote: vi.fn(),
  getProjectAccess: vi.fn(),
}));
vi.mock("./proactive-guard", () => ({ guardProactiveTool: H.guard }));
vi.mock("@/lib/server/numo-notes", async (original) => ({
  ...await original<typeof import("@/lib/server/numo-notes")>(),
  sendNumoNote: H.sendNumoNote,
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: H.getProjectAccess,
}));

import { executeTool, type ToolContext } from "./execute-tool";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.getProjectAccess.mockResolvedValue({
    project: { id: PROJECT, owner_id: "user-1" }, role: "owner", isOwner: true, isMember: true,
    canWrite: true, canComment: true,
  });
  H.sendNumoNote.mockResolvedValue({ ok: true, delivered: true });
});

describe("executeTool in a background turn", () => {
  it("returns the guard's refusal without running the tool", async () => {
    H.guard.mockResolvedValue({ ok: false, error: "move_to_trash refused" });
    const result = await executeTool("move_to_trash", { type: "issue", id: "x" }, context({ proactive: true }));
    expect(result).toEqual({ result: { error: "move_to_trash refused" }, success: false });
  });

  it("runs the tool with the arguments the guard returned", async () => {
    H.guard.mockResolvedValue({ ok: true, args: { project_id: PROJECT, title: "Down", body: "Prod is down.", urgent: true } });
    await executeTool("notify_me", { project_id: PROJECT, title: "Down", body: "Prod is down.", urgent: true,
      urgency_reason: "Production is down since 9am.", authorized_by: null }, context({ proactive: true }));
    expect(H.sendNumoNote).toHaveBeenCalledWith(expect.objectContaining({ urgent: true, title: "Down" }));
  });

  it("leaves a conversation unguarded, and never flags its notes urgent", async () => {
    await executeTool("notify_me", { project_id: PROJECT, title: "Down", body: "Prod is down.", urgent: true },
      context());
    expect(H.guard).not.toHaveBeenCalled();
    expect(H.sendNumoNote).toHaveBeenCalledWith(expect.objectContaining({ urgent: false }));
  });
});
