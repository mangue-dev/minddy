import { expect, it } from "vitest";
import { workerHarnessContext } from "./worker-harness-context";
import { buildGlobalSystemPrompt } from "./prompt";

it("uses the frozen harness and excludes credential-shaped input fields", () => {
  const run = { agent_engine: "codex", default_engine: "opencode", profile: "secret-profile" };
  const result = workerHarnessContext(run);
  expect(result).toMatchObject({ engine: "codex", harness_capabilities: {
    questions: "numo_mediation", minddyTools: true, nativeBuiltinTools: false,
    imageInput: false, subagents: false,
  } });
  expect(result.engine_name).toBe("Codex");
  expect(JSON.stringify(result)).not.toContain("secret-profile");
});

it.each([["opencode", "OpenCode"], ["claude_code", "Claude Code"]])("names the frozen %s worker clearly", (engine, name) => {
  expect(workerHarnessContext({ agent_engine: engine }).engine_name).toBe(name);
});

it.each(["loop", "future_engine", undefined])("does not assume current adapter support for unavailable %s workers", (engine) => {
  expect(workerHarnessContext({ agent_engine: engine })).toMatchObject({ harness_capabilities: null,
    harness_description: expect.stringContaining("Do not infer support") });
});

it("keeps native capability discovery and question mediation in the Numo prompt", () => {
  const prompt = buildGlobalSystemPrompt("en");
  expect(prompt).toContain("Read get_account_settings");
  expect(prompt).toContain("actual frozen worker engine");
  expect(prompt).toContain("image input and subagents are unavailable");
  expect(prompt).toContain("subscription failures stop\n  work without switching to API billing");
  expect(prompt).toContain("reliable\n  conversation context or ask the user");
});
