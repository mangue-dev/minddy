import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClientRead } from "./client-read";
import { confirmSessionAfterUnauthorized, resetUnauthorizedConfirmation, UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS } from "./session-revocation";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth }) }));

const refused = () => ({ data: { session: null }, error: Object.assign(new Error("Invalid Refresh Token: Session Expired"), { name: "AuthApiError", status: 400 }) });
beforeEach(() => {
  resetUnauthorizedConfirmation();
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "owner" } } }, error: null });
  auth.refreshSession.mockReset();
  auth.signOut.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("unauthorized protected reads", () => {
  it("drops a session the auth server refuses to refresh, once for concurrent 401s", async () => {
    auth.refreshSession.mockResolvedValue(refused());
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 401 })));
    const responses = await Promise.all([fetchClientRead("/api/projects"), fetchClientRead("/api/me/board")]);
    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    await vi.waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(auth.refreshSession).toHaveBeenCalledOnce();
  });

  it("keeps a session that still refreshes and ignores further 401s during the cooldown", async () => {
    vi.useFakeTimers();
    auth.refreshSession.mockResolvedValue({ data: { session: {} }, error: null });
    await confirmSessionAfterUnauthorized();
    await confirmSessionAfterUnauthorized();
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS);
    await confirmSessionAfterUnauthorized();
    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does not sign out when the auth server is unreachable", async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" }) });
    await confirmSessionAfterUnauthorized();
    auth.refreshSession.mockRejectedValue(new TypeError("Failed to fetch"));
    await confirmSessionAfterUnauthorized();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("leaves other statuses alone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Forbidden" }, { status: 403 })));
    await fetchClientRead("/api/projects");
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
