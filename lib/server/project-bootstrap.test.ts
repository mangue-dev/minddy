import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[id]/bootstrap/route";
import { createProjectBootstrapStream, parseProjectBootstrapReaders } from "./project-bootstrap";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), objectives: vi.fn(), members: vi.fn() }));
vi.mock("./api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("./project-working-set-readers", () => ({
  loadProjectObjectives: mocks.objectives,
  loadProjectMembers: mocks.members,
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => `localized:${key}` }));

const auth = { user: { id: "account-1" }, supabase: {} as SupabaseClient };
const projectId = "00000000-0000-4000-8000-000000000001";
const objectiveData = [{ id: "objective-1", name: "Complete objective", description: "Retained full DTO" }];
const membersData = { members: [{ user_id: "account-1", role: "owner" }],
  invitations: [{ id: "invitation-1", invited_email: "guest@example.test" }], isOwner: true };
const request = (query = "readers=objectives,members", signal?: AbortSignal) => new NextRequest(
  `https://www.minddy.app/api/projects/${projectId}/bootstrap?${query}`, { signal },
);
const context = () => ({ params: Promise.resolve({ id: projectId }) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function stream(signal = new AbortController().signal) {
  return createProjectBootstrapStream({ auth, projectId, readers: ["objectives", "members"], signal,
    translateError: (key) => `localized:${key}` });
}
const decode = (value: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(value));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, ...auth });
  mocks.objectives.mockResolvedValue({ ok: true, data: objectiveData });
  mocks.members.mockResolvedValue({ ok: true, data: membersData });
});

describe("project bootstrap admission", () => {
  it.each([null, "", "issues", "objectives,issues", "objectives,objectives", "objectives,members,objectives",
    " objectives", "members,", "*,members"])("rejects unsupported or ambiguous reader set %s", (value) => {
    expect(parseProjectBootstrapReaders(value)).toBeNull();
  });

  it.each(["objectives", "members", "objectives,members", "members,objectives"])(
    "accepts the explicit bounded reader set %s", (value) => {
      expect(parseProjectBootstrapReaders(value)).toEqual(value.split(","));
    },
  );

  it("authorizes once and passes the exact request-local authenticated client to ordinary readers", async () => {
    const incoming = request();
    const response = await GET(incoming, context());
    const frames = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(incoming);
    expect(mocks.objectives).toHaveBeenCalledExactlyOnceWith(authWithAdmission(), projectId);
    expect(mocks.members).toHaveBeenCalledExactlyOnceWith(authWithAdmission(), projectId);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(frames).toEqual(expect.arrayContaining([
      { version: 1, reader: "objectives", ok: true, data: objectiveData },
      { version: 1, reader: "members", ok: true, data: membersData },
    ]));
    expect(frames).toHaveLength(2);
  });

  it.each([401, 403, 503])("preserves the ordinary HTTP %i authorization rejection", async (status) => {
    const denied = new Response(JSON.stringify({ error: "Auth error", code: "MFA_REQUIRED" }), { status });
    mocks.auth.mockResolvedValue({ ok: false, response: denied });
    const response = await GET(request(), context());
    expect(response).toBe(denied);
    expect(mocks.objectives).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it.each(["", "readers=issues", "readers=objectives&readers=members"])(
    "rejects an invalid request before starting a reader: %s", async (query) => {
      const response = await GET(request(query), context());
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "localized:missingParameter" });
      expect(mocks.objectives).not.toHaveBeenCalled();
      expect(mocks.members).not.toHaveBeenCalled();
    },
  );

  it("does not reuse admission or settled DTOs across requests", async () => {
    await (await GET(request("readers=objectives"), context())).text();
    await (await GET(request("readers=objectives"), context())).text();
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(mocks.objectives).toHaveBeenCalledTimes(2);
    expect(mocks.members).not.toHaveBeenCalled();
  });
});

function authWithAdmission() { return { ok: true, ...auth }; }

describe("project bootstrap independent delivery", () => {
  it("delivers complete objectives while the member reader is still pending", async () => {
    const pending = deferred<unknown>();
    mocks.members.mockReturnValue(pending.promise);
    const reader = stream().getReader();
    expect(mocks.objectives).toHaveBeenCalledTimes(1);
    expect(mocks.members).toHaveBeenCalledTimes(1);
    expect(decode((await reader.read()).value)).toEqual({ version: 1, reader: "objectives", ok: true, data: objectiveData });
    pending.resolve({ ok: true, data: membersData });
    expect(decode((await reader.read()).value)).toEqual({ version: 1, reader: "members", ok: true, data: membersData });
    expect((await reader.read()).done).toBe(true);
  });

  it("delivers members independently when objectives finish later", async () => {
    const pending = deferred<unknown>();
    mocks.objectives.mockReturnValue(pending.promise);
    const reader = stream().getReader();
    expect(decode((await reader.read()).value)).toEqual({ version: 1, reader: "members", ok: true, data: membersData });
    pending.resolve({ ok: true, data: objectiveData });
    expect(decode((await reader.read()).value)).toEqual({ version: 1, reader: "objectives", ok: true, data: objectiveData });
    expect((await reader.read()).done).toBe(true);
  });

  it.each([404, 500])("keeps ordinary member failure %i separate from objective success", async (status) => {
    mocks.members.mockResolvedValue({ ok: false, status, errorKey: status === 404 ? "projectNotFound" : "databaseError" });
    const frames = (await new Response(stream()).text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(frames).toEqual(expect.arrayContaining([
      { version: 1, reader: "objectives", ok: true, data: objectiveData },
      { version: 1, reader: "members", ok: false, status,
        error: status === 404 ? "localized:projectNotFound" : "localized:databaseError" },
    ]));
  });

  it("turns unexpected reader failure into an explicit safe error without hiding its sibling", async () => {
    mocks.objectives.mockRejectedValue(new Error("Private SQL detail"));
    const body = await new Response(stream()).text();
    const frames = body.trim().split("\n").map((line) => JSON.parse(line));
    expect(body).not.toContain("Private SQL");
    expect(frames).toEqual(expect.arrayContaining([
      { version: 1, reader: "objectives", ok: false, status: 500, error: "localized:databaseError" },
      { version: 1, reader: "members", ok: true, data: membersData },
    ]));
  });

  it("does not admit reads for an already aborted request", async () => {
    const aborted = new AbortController();
    aborted.abort();
    expect(await new Response(stream(aborted.signal)).text()).toBe("");
    expect(mocks.objectives).not.toHaveBeenCalled();
    expect(mocks.members).not.toHaveBeenCalled();
  });

  it("suppresses unresolved frames and removes its listener after request abort", async () => {
    const aborted = new AbortController();
    const remove = vi.spyOn(aborted.signal, "removeEventListener");
    const pending = deferred<unknown>();
    mocks.members.mockReturnValue(pending.promise);
    const reader = stream(aborted.signal).getReader();
    expect(decode((await reader.read()).value).reader).toBe("objectives");
    aborted.abort();
    pending.resolve({ ok: true, data: membersData });
    expect((await reader.read()).done).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("suppresses late reader results after the body consumer cancels", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = deferred<unknown>();
    mocks.members.mockReturnValue(pending.promise);
    const reader = stream(controller.signal).getReader();
    await reader.read();
    await reader.cancel();
    pending.resolve({ ok: true, data: membersData });
    expect((await reader.read()).done).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });

  it("cleans up the abort listener when every independent result completes", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await new Response(stream(controller.signal)).text();
    expect(remove).toHaveBeenCalledOnce();
  });
});
