import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ token: vi.fn(), connection: vi.fn(), gitlabToken: vi.fn() }));
vi.mock("./user-identities", () => ({ getGithubUserToken: h.token }));
vi.mock("./connections", () => ({ findReusableConnection: h.connection }));
vi.mock("./gitlab-app", () => ({ getGitlabAccessToken: h.gitlabToken }));
const opts = { userId: "reader", provider: "github" as const, repoFullName: "acme/app" };
beforeEach(() => {
  vi.resetModules();
  h.token.mockReset().mockResolvedValue({ token: "user-token", login: "reader", avatarUrl: null });
  h.connection.mockReset().mockResolvedValue({ id: "connection", account_login: "reader" });
  h.gitlabToken.mockReset().mockResolvedValue("gitlab-token");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function resolver() { return (await import("./forge-actor")).resolveForgeActor; }

describe("batch actor read admission", () => {
  it.each(["github", "gitlab"] as const)("gates the %s capability request after waiting for identity", async (provider) => {
    let release!: (value: { token: string; login: string; avatarUrl: null }) => void;
    const account = new Promise<{ token: string; login: string; avatarUrl: null }>((resolve) => { release = resolve; });
    if (provider === "github") h.token.mockReturnValue(account);
    else h.gitlabToken.mockImplementation(async () => (await account).token);
    const fetch = vi.fn().mockResolvedValue(Response.json({ permissions: { push: true } })); vi.stubGlobal("fetch", fetch);
    const blocked = new Error("Known batch quota"); let pause = false;
    const options = { ...opts, provider, readControl: { beforeRead: () => { if (pause) throw blocked; }, onRateLimit: vi.fn() } };
    const resolve = await resolver(); const pending = resolve(options);
    await vi.waitFor(() => expect(provider === "github" ? h.token : h.gitlabToken).toHaveBeenCalledOnce());
    pause = true; release({ token: "user-token", login: "reader", avatarUrl: null });
    await expect(pending).rejects.toBe(blocked); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([403, 429])("reports an actual actor capability quota %s without inventing write access", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status, headers: { "Retry-After": "125" } })));
    const readControl = { beforeRead: vi.fn(), onRateLimit: vi.fn() };
    const resolve = await resolver();
    expect(await resolve({ ...opts, readControl })).toMatchObject({ capability: "read" });
    expect(readControl.onRateLimit).toHaveBeenCalledWith(status, "125");
  });

  it("reports the primary GitHub quota reset when Retry-After is absent", async () => {
    const now = Date.parse("2026-10-14T15:00:00Z"); vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 403, headers: {
      "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now / 1000 + 125),
    } })));
    const readControl = { beforeRead: vi.fn(), onRateLimit: vi.fn() };
    const resolve = await resolver(); await resolve({ ...opts, readControl });
    expect(readControl.onRateLimit).toHaveBeenCalledWith(403, "125");
  });

  it("keeps a plain forbidden actor response distinct from known quota", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 403 })));
    const readControl = { beforeRead: vi.fn(), onRateLimit: vi.fn() };
    const resolve = await resolver();
    expect(await resolve({ ...opts, readControl })).toMatchObject({ capability: "read" });
    expect(readControl.onRateLimit).not.toHaveBeenCalled();
  });

  it("preserves ordinary actor fallback when no batch control is supplied", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "125" } })));
    const resolve = await resolver();
    expect(await resolve(opts)).toMatchObject({ capability: "read" });
  });

  it("does not start a second capability probe after rotation finishes under a known batch quota", async () => {
    let pause = false;
    h.token.mockResolvedValueOnce({ token: "old-token", login: "reader", avatarUrl: null })
      .mockImplementationOnce(async () => { pause = true; return { token: "new-token", login: "reader", avatarUrl: null }; });
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 401 })); vi.stubGlobal("fetch", fetch);
    const blocked = new Error("Known batch quota");
    const options = { ...opts, readControl: { beforeRead: () => { if (pause) throw blocked; }, onRateLimit: vi.fn() } };
    const resolve = await resolver();
    await expect(resolve(options)).rejects.toBe(blocked);
    expect(h.token).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledOnce();
  });
});
