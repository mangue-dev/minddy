import { beforeEach, expect, it, vi } from "vitest";
import { agentHarnessCapabilities, describeAgentHarnessCapabilities } from "@/lib/agent-harness-capabilities";
import type { LiveAgentEngine } from "@/lib/agent-engines";

vi.mock("server-only", () => ({}));
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/account-settings", () => ({ readAccountAgentPreferences: read }));
import { buildAccountWorkerContext } from "./account-worker-context";

beforeEach(() => { read.mockReset(); });

function preferences(engine: LiveAgentEngine) {
  return {
    default_engine: engine,
    native_agents_enabled: true,
    native_connection: engine === "opencode" ? "not_selected" : "connected",
    harness_capabilities: agentHarnessCapabilities(engine),
    harness_description: describeAgentHarnessCapabilities(engine),
    default_model: "saved-api-model",
    default_reasoning_level: "high",
    profile_ciphertext: "private-profile",
    leaseId: "private-lease",
    email: "private-email",
    branch_prefix: "private-prefix",
  };
}

it.each(["opencode", "codex", "claude_code"] as const)("supplies current %s selection while deferring to the frozen launched worker", async (engine) => {
  read.mockResolvedValue({ ok: true, prefs: preferences(engine) });
  const result = await buildAccountWorkerContext("owner");
  expect(read).toHaveBeenCalledWith("owner");
  expect(result).toContain(`"selected_engine":"${engine}"`);
  expect(result).toContain("actual frozen engine and take precedence");
  expect(result).toContain("Name that engine");
  expect(result).not.toMatch(/private-|profile_ciphertext|leaseId|email|branch_prefix/);
  if (engine === "opencode") {
    expect(result).toContain('"api_model":"saved-api-model"');
  } else {
    expect(result).not.toContain("saved-api-model");
    expect(result).not.toContain("api_reasoning_level");
    expect(result).toContain('"funding":"subscription"');
    expect(result).toContain('"nativeBuiltinTools":false');
  }
  if (engine === "claude_code") expect(result).toContain("Paid Claude execution has not been validated");
});

it("does not turn an unavailable native selection into OpenCode", async () => {
  read.mockResolvedValue({ ok: true, prefs: { ...preferences("codex"),
    native_agents_enabled: false, native_connection: "unavailable" } });
  const result = await buildAccountWorkerContext("owner");
  expect(result).toContain('"selected_engine":"codex"');
  expect(result).toContain('"native_connection":"unavailable"');
  expect(result).toContain("Never change the engine or fall back to API billing");
});

it.each(["refusal", "exception"])("keeps Numo available on preference lookup %s without leaking the error", async (failure) => {
  if (failure === "refusal") read.mockResolvedValue({ ok: false, error: "private-database-details" });
  else read.mockRejectedValue(new Error("private-database-details"));
  const result = await buildAccountWorkerContext("owner");
  expect(result).toContain("Do not guess its engine");
  expect(result).toContain("actual launch results and validated worker events remain authoritative");
  expect(result).not.toContain("private-database-details");
});
