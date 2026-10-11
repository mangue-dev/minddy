import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore } from "@/lib/server/encryption/store";

const h = vi.hoisted(() => ({ protect: false, rpc: vi.fn(), from: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/server/encryption/content-config", () => ({ isContentEncryptionEnabled: () => h.protect }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: h.rpc, from: h.from }) }));

const keys = new Map([[1,randomBytes(32)],[2,randomBytes(32)]]);
const store = new EncryptedStore({
  current: async () => ({version:2,bytes:Buffer.from(keys.get(2)!)}),
  byVersion: async (_scope,version) => ({version,
    bytes:Buffer.from(keys.get(version)!)}),
});
vi.mock("@/lib/server/encryption/registry",()=>({getEncryptedStore:()=>store}));

const { encodeAgentBranchPrefix, decodeAgentBranchPrefix,
  agentBranchPrefixVersion, saveAgentPreferences } = await import("./branch-prefix-content");

beforeEach(() => {
  h.protect = false;
  h.rpc.mockReset().mockReturnValue({ single: h.single });
  h.single.mockReset().mockResolvedValue({ data: { user_id: "owner", branch_prefix: "numo/", default_engine: "codex" }, error: null });
  h.from.mockReset().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) });
});

describe("personal agent branch namespace", () => {
  it("seals the source and restores only for its owner", async () => {
    const user = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
    const cipher = await encodeAgentBranchPrefix(user,"private/team/");
    expect(cipher).toMatch(/^mdye3:/);
    expect(cipher).not.toContain("private/team/");
    expect(agentBranchPrefixVersion(cipher)).toBe(2);
    expect(await decodeAgentBranchPrefix(user,cipher)).toBe("private/team/");
    await expect(decodeAgentBranchPrefix("other-user",cipher)).rejects.toThrow();
    expect(await decodeAgentBranchPrefix(user,"legacy/")).toBe("legacy/");
    await expect(encodeAgentBranchPrefix(user,"bad..prefix/"))
      .rejects.toThrow();
  });

  it("uses an atomic partial RPC for unprotected harness and model changes", async () => {
    await saveAgentPreferences("owner", { default_engine: "codex" });
    expect(h.rpc).toHaveBeenLastCalledWith("upsert_agent_preferences_partial", {
      p_user_id: "owner", p_values: { default_engine: "codex" },
    });
    await saveAgentPreferences("owner", { default_model: "api-model" });
    expect(h.rpc).toHaveBeenLastCalledWith("upsert_agent_preferences_partial", {
      p_user_id: "owner", p_values: { default_model: "api-model" },
    });
    expect(h.from).toHaveBeenCalledWith("agent_branch_prefix_scope");
  });

  it("uses the encrypted merge RPC when branch protection is enabled", async () => {
    h.protect = true;
    await saveAgentPreferences("owner", { default_engine: "claude_code" });
    expect(h.rpc).toHaveBeenCalledWith("upsert_agent_preferences_protected", {
      p_user_id: "owner", p_values: { default_engine: "claude_code" },
      p_branch_cipher: expect.stringMatching(/^mdye3:/), p_replace_branch: false,
    });
    expect(h.from).not.toHaveBeenCalled();
  });

  it("rejects forged envelopes and unsupported preference fields before storage", async () => {
    await expect(saveAgentPreferences("owner", { branch_prefix: 'mdye3:{"format":3}' })).rejects.toThrow("Invalid agent branch prefix");
    await expect(saveAgentPreferences("owner", { user_id: "other" })).rejects.toThrow("Unsupported agent preference field");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the partial merge fails", async () => {
    h.single.mockResolvedValue({ data: null, error: { code: "23514" } });
    await expect(saveAgentPreferences("owner", { default_engine: "codex" })).rejects.toThrow("Unable to save agent preferences");
  });
});
