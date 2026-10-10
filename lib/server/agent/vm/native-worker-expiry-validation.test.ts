import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expiredCodexAccessFixture, EXPIRED_ACCESS_FIXTURE, stageExpiredCodexAccessFixture } from "./native-worker-expiry-validation";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const auth = {
  OPENAI_API_KEY: null, auth_mode: "chatgpt", last_refresh: "2026-10-10T00:00:00Z",
  tokens: { access_token: "original-provider-access", refresh_token: "original-provider-refresh", id_token: "original-provider-identity", account_id: "owner-account" },
};
const profile = () => ({ version: 1, engine: "codex", files: [{ path: "auth.json", content: JSON.stringify(auth) }] });

describe("private Codex access-expiry acceptance fixture", () => {
  it("replaces only ephemeral access authentication without changing provider-signed claims or renewal identity", () => {
    const original = profile();
    const fixture = expiredCodexAccessFixture(original);
    const staged = JSON.parse(fixture.files[0].content);
    expect(staged).toEqual({ ...auth, tokens: { ...auth.tokens, access_token: EXPIRED_ACCESS_FIXTURE } });
    expect(original).toEqual(profile());
    const [header, payload, signature] = EXPIRED_ACCESS_FIXTURE.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "none", typ: "MINDDY_TEST_ONLY" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString()).exp * 1000).toBeLessThan(Date.now());
    expect(signature).toBe("not-a-provider-signature");
  });
  it.each([
    { ...profile(), engine: "claude_code" },
    { ...profile(), files: [{ path: "auth.json", content: JSON.stringify({ OPENAI_API_KEY: "api-key" }) }] },
    { ...profile(), files: [{ path: "auth.json", content: JSON.stringify({ ...auth, tokens: { ...auth.tokens, id_token: null } }) }] },
  ])("rejects incompatible or incomplete credentials", (value) => {
    expect(() => expiredCodexAccessFixture(value)).toThrow();
  });
  it("atomically stages a private import and returns metadata only while leaving the saved copy intact", async () => {
    const root = await mkdtemp(join(tmpdir(), "minddy-expiry-fixture-")); roots.push(root);
    const input = join(root, "profile-import.json"); const saved = join(root, "saved-profile.json");
    const original = JSON.stringify(profile());
    await writeFile(input, original, { mode: 0o600 }); await writeFile(saved, original, { mode: 0o600 });
    const proof = await stageExpiredCodexAccessFixture(input);
    expect(proof).toEqual({ simulationKind: "synthetic_expired_access", simulatedAccessExpired: true, refreshTokenPreserved: true, idTokenPreserved: true, accountIdPreserved: true, providerSignedClaimsModified: false, hostClockChanged: false });
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual(expiredCodexAccessFixture(profile()));
    expect(await readFile(saved, "utf8")).toBe(original);
    expect((await stat(input)).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(proof)).not.toContain("original-provider");
  });
  it("refuses linked imports without modifying the credential target", async () => {
    const root = await mkdtemp(join(tmpdir(), "minddy-expiry-fixture-")); roots.push(root);
    const target = join(root, "saved-profile.json"); const input = join(root, "profile-import.json");
    const original = JSON.stringify(profile()); await writeFile(target, original); await symlink(target, input);
    await expect(stageExpiredCodexAccessFixture(input)).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe(original);
  });
});
