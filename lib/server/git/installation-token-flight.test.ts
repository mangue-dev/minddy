import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearInstallationTokenCacheForTests, getInstallationToken } from "./github-app";

vi.mock("@/lib/server/capabilities", () => ({ requireCapability: vi.fn(), capability: vi.fn() }));
const key = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
const reply = (token: string) => Response.json({ token, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
beforeEach(() => {
  __clearInstallationTokenCacheForTests(); vi.stubEnv("GITHUB_APP_ID", "1"); vi.stubEnv("GITHUB_APP_PRIVATE_KEY", String(key));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); __clearInstallationTokenCacheForTests(); });

describe("installation token mint flights", () => {
  it("shares equal structural scopes and separates permissions, repositories and installations", async () => {
    const releases: Array<(response: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { releases.push(resolve); })); vi.stubGlobal("fetch", fetch);
    const first = getInstallationToken(1, { repositoryIds: [2, 1], permissions: { contents: "read" } });
    const equal = getInstallationToken(1, { repositoryIds: [1, 2], permissions: { contents: "read" } });
    const other = [getInstallationToken(2), getInstallationToken(1, { repositoryIds: [1] }), getInstallationToken(1, { repositoryIds: [1, 2], permissions: { contents: "write" } })];
    expect(fetch).toHaveBeenCalledTimes(4); releases.forEach((release, index) => release(reply(`token-${index}`)));
    expect(await first).toEqual(await equal); await Promise.all(other);
  });

  it("removes failed mints so the next explicit read can recover", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ message: "Denied" }, { status: 403 })).mockResolvedValueOnce(reply("recovered")); vi.stubGlobal("fetch", fetch);
    const errors = await Promise.allSettled([getInstallationToken(1), getInstallationToken(1)]);
    expect(errors.every((result) => result.status === "rejected")).toBe(true); expect(fetch).toHaveBeenCalledOnce();
    expect((await getInstallationToken(1)).token).toBe("recovered"); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cannot repopulate retired token state from an old operation", async () => {
    let release!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; })).mockResolvedValue(reply("current")); vi.stubGlobal("fetch", fetch);
    const old = getInstallationToken(1); __clearInstallationTokenCacheForTests();
    const current = await getInstallationToken(1); release(reply("retired")); await old;
    expect(await getInstallationToken(1)).toEqual(current); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
