import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClientRead } from "./client-read";
import { confirmSessionAfterUnauthorized, resetUnauthorizedConfirmation, UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS } from "./session-revocation";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth }) }));

const sessionInvalid = () => Response.json({ error: "Unauthorized", code: "sessionInvalid" }, { status: 401 });
const refreshed = () => ({ data: { session: {} }, error: null });
const refused = () => ({ data: { session: null }, error: Object.assign(new Error("Invalid Refresh Token: Session Expired"), { name: "AuthApiError", status: 400 }) });
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  resetUnauthorizedConfirmation();
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "owner" } } }, error: null });
  auth.refreshSession.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("session refusals on protected reads", () => {
  it("drops a session the auth server refuses to refresh, once for concurrent 401s", async () => {
    auth.refreshSession.mockResolvedValue(refused());
    fetchMock.mockImplementation(async () => sessionInvalid());
    const responses = await Promise.all([fetchClientRead("/api/projects"), fetchClientRead("/api/me/board")]);
    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });

  // MIN-691: the auth server kept refreshing a session older than the API's
  // 30-day lifetime, so a successful refresh alone proved nothing.
  it("drops a session the auth server refreshes but the API still refuses", async () => {
    auth.refreshSession.mockResolvedValue(refreshed());
    fetchMock.mockImplementation(async () => sessionInvalid());
    await confirmSessionAfterUnauthorized("/api/projects");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.anything());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps a session the API accepts after refresh and ignores further 401s during the cooldown", async () => {
    vi.useFakeTimers();
    auth.refreshSession.mockResolvedValue(refreshed());
    fetchMock.mockImplementation(async () => Response.json([]));
    await confirmSessionAfterUnauthorized("/api/projects");
    await confirmSessionAfterUnauthorized("/api/projects");
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS);
    await confirmSessionAfterUnauthorized("/api/projects");
    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out when the auth server or the API is unreachable", async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" }) });
    await confirmSessionAfterUnauthorized("/api/projects");
    auth.refreshSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await confirmSessionAfterUnauthorized("/api/projects");
    auth.refreshSession.mockResolvedValue(refreshed());
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await confirmSessionAfterUnauthorized("/api/projects");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("ignores forge credential 401s and other statuses", async () => {
    for (const response of [
      Response.json({ error: "Bad credentials", code: "forgeUnauthorized" }, { status: 401 }),
      Response.json({ error: "Unauthorized" }, { status: 401 }),
      Response.json({ error: "Forbidden" }, { status: 403 }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await fetchClientRead("/api/pull-requests/pr");
    }
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
