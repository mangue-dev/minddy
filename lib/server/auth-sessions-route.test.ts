import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  result: { data: true as unknown, error: null as unknown },
  auth: { ok: true } as Record<string, unknown>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => h.auth }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: (...args: unknown[]) => {
      h.rpc(...args);
      return { abortSignal: async () => h.result };
    },
  }),
}));

import { DELETE } from "@/app/api/account/sessions/[id]/route";

const OTHER = "6f9a1c2e-3b4d-4e5f-8a6b-7c8d9e0f1a2b";
const CURRENT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const call = (id: string) =>
  DELETE(new NextRequest(`https://minddy.test/api/account/sessions/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  h.rpc.mockClear();
  h.result = { data: true, error: null };
  h.auth = { ok: true, user: { id: "owner" }, claims: { session_id: CURRENT } };
});

it("ends the named session of the verified account, never trusting the body", async () => {
  const response = await call(OTHER);

  expect(response.status).toBe(204);
  expect(h.rpc).toHaveBeenCalledWith("revoke_auth_session", {
    p_user: "owner",
    p_session: OTHER,
    p_current_session: CURRENT,
  });
});

it("answers 404 when the function ends nothing (own, foreign or gone session)", async () => {
  h.result = { data: false, error: null };
  expect((await call(CURRENT)).status).toBe(404);
});

it("refuses a malformed id without reaching the database", async () => {
  expect((await call("not-a-session")).status).toBe(404);
  expect(h.rpc).not.toHaveBeenCalled();
});

it("keeps the database error out of the response", async () => {
  h.result = { data: null, error: { message: "permission denied" } };
  const response = await call(OTHER);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("permission");
});

it("returns the authentication refusal as is", async () => {
  h.auth = { ok: false, response: new Response(null, { status: 401 }) };
  expect((await call(OTHER)).status).toBe(401);
  expect(h.rpc).not.toHaveBeenCalled();
});
