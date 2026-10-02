import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  allowed: false,
  read: vi.fn(async () => ({ stream: { text: "Private live text", at: 10 }, diff: null })),
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "member-1" } }),
}));
vi.mock("./run-access", () => ({
  canReadAgentRun: async () => state.allowed,
}));
vi.mock("./runs", () => ({
  getRun: async () => ({ id: "run-1", project_id: "project-1" }),
}));
vi.mock("./live-snapshot", () => ({
  readAgentLiveSnapshot: state.read,
}));
const { GET } = await import("@/app/api/agent-runs/[runId]/live/route");

beforeEach(() => {
  state.allowed = false;
  state.read.mockClear();
});

describe("agent live route", () => {
  it("does not read protected content for an unauthorized member", async () => {
    const response = await GET(new Request("https://minddy.test/live") as NextRequest,
      { params: Promise.resolve({ runId: "run-1" }) });
    expect(response.status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
  });

  it("reads the project-bound snapshot after authorization", async () => {
    state.allowed = true;
    const response = await GET(new Request("https://minddy.test/live") as NextRequest,
      { params: Promise.resolve({ runId: "run-1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      stream: { text: "Private live text", at: 10 }, diff: null,
    });
    expect(state.read).toHaveBeenCalledWith({
      projectId: "project-1", runId: "run-1", actorId: "member-1",
    });
  });
});
