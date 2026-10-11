import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateNativeProfile, assertNativeProfileContinuity } from "./native-agent-profile";
import { importProfile, exportProfile } from "./server/agent/vm/native-prototype/profile";

const codex = (account = "account-1") => ({ version: 1 as const, engine: "codex" as const,
  files: [{ path: "auth.json", content: JSON.stringify({ tokens: { account_id: account,
    access_token: "synthetic-access", refresh_token: "synthetic-refresh" } }) }] });
const claude = (account: string) => ({ version: 1 as const, engine: "claude_code" as const,
  files: [{ path: ".credentials.json", content: JSON.stringify({ claudeAiOauth: {
    accessToken: "synthetic-access", refreshToken: "synthetic-refresh" } }) },
  { path: ".claude.json", content: JSON.stringify({ oauthAccount: { accountUuid: account } }) }] });

describe("shared subscription profile validation", () => {
  it("rejects empty, corrupt and API profiles before they enter the vault or native home", () => {
    for (const content of ["{}", "null", "[]", "not-json", '{"OPENAI_API_KEY":"synthetic-api"}',
      JSON.stringify({ OPENAI_API_KEY: "synthetic-api", tokens: { access_token: "access", refresh_token: "refresh" } })]) {
      expect(() => validateNativeProfile({ ...codex(), files: [{ path: "auth.json", content }] }, "codex")).toThrow();
    }
    expect(() => validateNativeProfile({ ...claude("account-1"), files: [{ path: ".credentials.json", content: "{}" }] }, "claude_code")).toThrow();
    expect(() => validateNativeProfile(codex(), "claude_code")).toThrow();
  });

  it("allows native token rotation while preserving provider account identity", () => {
    for (const profile of [codex("account-1"), claude("account-1")]) {
      const rotated = JSON.parse(JSON.stringify(profile).replaceAll("synthetic-refresh", "rotated-refresh"));
      expect(() => assertNativeProfileContinuity(profile, rotated)).not.toThrow();
      const changed = JSON.parse(JSON.stringify(rotated).replaceAll("account-1", "account-2"));
      expect(() => assertNativeProfileContinuity(profile, changed)).toThrow("account changed");
    }
  });

  it("cleans a failed replacement and permits retry despite an abandoned old staging file", async () => {
    const root = await mkdtemp(join(tmpdir(), "minddy-profile-retry-"));
    try {
      await mkdir(join(root, "codex", "auth.json"), { recursive: true });
      await writeFile(join(root, "codex", "auth.json.import"), "abandoned", { mode: 0o600 });
      await expect(importProfile(root, codex())).rejects.toThrow();
      expect((await readdir(join(root, "codex"))).sort()).toEqual(["auth.json", "auth.json.import"]);
      await rm(join(root, "codex", "auth.json"), { recursive: true });
      await importProfile(root, codex());
      expect(await exportProfile(root, "codex")).toEqual(codex());
      expect((await stat(join(root, "codex", "auth.json"))).mode & 0o777).toBe(0o600);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
