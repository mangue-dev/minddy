import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  getAuthedUser: vi.fn(),
  submit: vi.fn(),
  snapshot: vi.fn(),
  steps: vi.fn(),
  user: 0,
}));

vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: h.getAuthedUser }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/pages", () => ({
  submitPageCollaboration: h.submit,
  readPageCollaborationSnapshot: h.snapshot,
  readPageCollaborationSteps: h.steps,
}));

const { GET, POST } = await import("@/app/api/projects/[id]/pages/[pageId]/collaboration/route");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";
const params = { params: Promise.resolve({ id: PROJECT, pageId: PAGE }) };
const url = `http://localhost/api/projects/${PROJECT}/pages/${PAGE}/collaboration`;

const batch = (extra: Record<string, unknown> = {}) => ({
  field: "body", base: 0, batchId: "33333333-3333-4333-8333-333333333333",
  clientId: "browser-session-1", steps: [{ stepType: "replace", from: 1, to: 1 }], ...extra,
});
const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("live collaboration route (MIN-688)", () => {
  beforeEach(() => {
    // A distinct account per test: the rate limiter is per account and process.
    h.user += 1;
    h.getAuthedUser.mockReset().mockResolvedValue({ ok: true, user: { id: `user-${h.user}` } });
    h.submit.mockReset().mockResolvedValue({ ok: true, token: "next-token",
      result: { status: "accepted", revision: 1 } });
  });

  it("passes the session token to the authority and returns the renewed one", async () => {
    const response = await POST(post(JSON.stringify(batch()), { "x-minddy-collab-token": "c1.a.b" }), params);
    expect(response.status).toBe(200);
    expect(h.submit).toHaveBeenCalledWith(expect.objectContaining({ token: "c1.a.b", actorId: `user-${h.user}` }));
    expect(response.headers.get("x-minddy-collab-token")).toBe("next-token");
  });

  it("refuses an oversized body before reading or parsing it", async () => {
    const huge = JSON.stringify(batch({ steps: [{ stepType: "replace", text: "x".repeat(600_000) }] }));
    const response = await POST(post(huge), params);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ status: "refused", reason: "too-large" });
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("refuses a batch inserting more text than one batch may", async () => {
    const steps = Array.from({ length: 3 }, () => ({ stepType: "replace", slice: { content: [{ type: "text", text: "y".repeat(90_000) }] } }));
    const response = await POST(post(JSON.stringify(batch({ steps }))), params);
    expect(response.status).toBe(413);
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("answers an invalid batch with a refusal the client can read", async () => {
    const response = await POST(post(JSON.stringify(batch({ steps: [] }))), params);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ status: "refused", reason: "invalid-step" });
  });

  it("limits the batches one account sends per minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 601; i += 1) statuses.push((await POST(post(JSON.stringify(batch())), params)).status);
    expect(statuses.slice(0, 600).every((status) => status === 200)).toBe(true);
    expect(statuses[600]).toBe(429);
  });

  it("limits catch-up reads separately", async () => {
    h.steps.mockResolvedValue({ ok: true, token: "t", catchUp: { kind: "steps" } });
    const statuses: number[] = [];
    for (let i = 0; i < 1_801; i += 1) {
      statuses.push((await GET(new NextRequest(`${url}?field=body&since=0`), params)).status);
    }
    expect(statuses[1_799]).toBe(200);
    expect(statuses[1_800]).toBe(429);
  });
});
