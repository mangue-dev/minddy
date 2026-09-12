import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveServerExecSecret,
  signServerExecToken,
} from "./server-exec-token";

const h = vi.hoisted(() => ({
  seen: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/agent/control-plane", () => ({
  CONTROL_PLANE_MAX_BODY_BYTES: 1024,
  handleControlPlaneRequest: vi.fn(async (input: Record<string, unknown>) => {
    h.seen.push(input);
    return { status: 200, body: { ok: true } };
  }),
}));

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "server-exec-route-test";

import { POST } from "@/app/api/agent-vm/[...path]/route";

const RUN_ID = "11111111-2222-4333-8444-555555555555";

function request(authorization?: string) {
  return new Request("https://minddy.test/api/agent-vm/events", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
    body: JSON.stringify({ type: "assistant_message" }),
  });
}

beforeEach(() => {
  h.seen.length = 0;
});

describe("self-hosted server runner control-plane admission", () => {
  it("accepts the deployment server runner contract", async () => {
    const secret = resolveServerExecSecret();
    if (!secret) throw new Error("server execution test secret is unavailable");
    const response = await POST(
      request(`Bearer ${signServerExecToken(RUN_ID, secret)}`),
    );

    expect(response.status).toBe(200);
    expect(h.seen[0]).toMatchObject({
      runId: RUN_ID,
      surface: "/events",
      server: true,
    });
  });

  it("rejects missing and legacy desktop tokens", async () => {
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request("Bearer legacy.desktop.token"))).status).toBe(403);
    expect(h.seen).toEqual([]);
  });
});
