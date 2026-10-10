import { describe, expect, it } from "vitest";
import { claudeNativeModelCatalog, isNativeModelPreference, normalizeNativeModelPreferences, parseCodexModels } from "./native-agent-models";

describe("native subscription model contracts", () => {
  it("retains independent native preferences without borrowing API defaults", () => {
    expect(normalizeNativeModelPreferences({ codex: { model: "codex-future", reasoningEffort: "ultra" } })).toEqual({ codex: { model: "codex-future", reasoningEffort: "ultra" }, claude_code: { model: null, reasoningEffort: null } });
    expect(isNativeModelPreference("claude_code", { model: "sonnet", reasoningEffort: "ultra" })).toBe(false);
    expect(isNativeModelPreference("codex", { model: "default", reasoningEffort: null })).toBe(false);
    expect(isNativeModelPreference("codex", { model: "unsafe\nmodel", reasoningEffort: null })).toBe(false);
    expect(isNativeModelPreference("codex", { model: null, reasoningEffort: null, provider: "openrouter" })).toBe(false);
  });
  it("uses stable Claude aliases without separately billed aliases", () => {
    const catalog = claudeNativeModelCatalog();
    expect(catalog.source).toBe("aliases");
    expect(catalog.models.map((item) => item.id)).toEqual(["sonnet", "opus", "haiku"]);
    expect(catalog.models.every((item) => item.supportedReasoningEfforts.includes("max"))).toBe(true);
  });
  it("preserves actual Codex advertised efforts and strips private fields", () => {
    const models = parseCodexModels([{ id: "picker-id", model: "future-codex", displayName: "Future Codex", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "Balanced" }, { reasoningEffort: "ultra", description: "Deep" }], defaultReasoningEffort: "medium", privateMetadata: "not returned" }]);
    expect(models).toEqual([{ id: "future-codex", displayName: "Future Codex", isDefault: true, supportedReasoningEfforts: ["medium", "ultra"], defaultReasoningEffort: "medium" }]);
    expect(parseCodexModels(models)).toEqual(models);
  });
  it("rejects malformed, duplicate, unbounded or inconsistent catalogs", () => {
    const model = { id: "safe", displayName: "Safe", supportedReasoningEfforts: ["high"], defaultReasoningEffort: "high" };
    for (const value of [[model, model], [{ ...model, defaultReasoningEffort: "ultra" }], [{ ...model, supportedReasoningEfforts: ["unrecognized"] }], [{ ...model, displayName: "Unsafe\nname" }], Array(201).fill(model), null]) expect(() => parseCodexModels(value)).toThrow();
  });
});
