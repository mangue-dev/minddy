import { describe, expect, it } from "vitest";

import {
  buildModelConfigFile,
  diffModelConfig,
  MODEL_CONFIG_FILE_FORMAT,
  MODEL_CONFIG_FILE_VERSION,
  parseModelConfigFile,
} from "@/lib/ai-model-config-file";

/**
 * The model configuration file (MIN-829): what one instance exports must
 * import into another as the same configuration, a newer file is refused,
 * and an import replaces rather than merges.
 */

const STORED = {
  assistant_model: "openai/gpt-5-mini",
  issue_embedding_model: "google/gemini-embedding-001",
  jev_model: "liquid/d1",
  assistant_reasoning_level: "high",
  byok_default_openai_assistant_model: "gpt-5",
  smart_fill_model: null,
};

describe("model configuration file", () => {
  it("writes only what is set, under its version", () => {
    const file = buildModelConfigFile(STORED, new Date("2026-10-29T00:00:00Z"));
    expect(file).toEqual({
      format: MODEL_CONFIG_FILE_FORMAT,
      version: MODEL_CONFIG_FILE_VERSION,
      exportedAt: "2026-10-29T00:00:00.000Z",
      tasks: {
        assistant_model: { model: "openai/gpt-5-mini" },
        issue_embedding_model: { model: "google/gemini-embedding-001" },
        jev_model: { model: "liquid/d1" },
      },
      reasoningLevel: "high",
      providerDefaults: { byok_default_openai_assistant_model: "gpt-5" },
    });
  });

  it("imports an export as the same configuration", () => {
    const parsed = parseModelConfigFile(JSON.stringify(buildModelConfigFile(STORED)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(diffModelConfig(STORED, parsed.values)).toEqual([]);
    expect(parsed.upgraded).toBe(false);
  });

  it("returns every setting the file leaves out to its default", () => {
    const parsed = parseModelConfigFile({
      format: MODEL_CONFIG_FILE_FORMAT,
      version: MODEL_CONFIG_FILE_VERSION,
      tasks: { assistant_model: { model: "openai/gpt-5" } },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const changes = diffModelConfig(STORED, parsed.values);
    expect(changes).toContainEqual({ key: "assistant_model", from: "openai/gpt-5-mini", to: "openai/gpt-5" });
    expect(changes).toContainEqual({ key: "jev_model", from: "liquid/d1", to: null });
    expect(changes).toContainEqual({ key: "issue_embedding_model", from: "google/gemini-embedding-001", to: null });
  });

  it("upgrades a version 1 file: categories fill their role, the rest is named (MIN-954)", () => {
    const parsed = parseModelConfigFile({
      format: MODEL_CONFIG_FILE_FORMAT,
      version: 1,
      categories: {
        assistant: { model: "anthropic/claude-haiku-5.5", suffix: "nitro" },
        automations: { model: "openai/gpt-5-mini" },
      },
      tasks: { brief_model: { model: "openai/gpt-5" }, transcription_model: { model: "openai/whisper-large-v3" } },
      recommendedModels: ["openai/gpt-5-mini"],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.upgraded).toBe(true);
    expect(parsed.values).toMatchObject({
      assistant_model: "anthropic/claude-haiku-5.5",
      transcription_model: "openai/whisper-large-v3",
    });
    expect(parsed.values).not.toHaveProperty("assistant_model_suffix");
    expect(parsed.ignored).toEqual([
      "categories.automations",
      "tasks.brief_model",
      "tasks.assistant_model.suffix",
      "recommendedModels",
    ]);
  });

  it("refuses a file written by a newer release", () => {
    expect(
      parseModelConfigFile({ format: MODEL_CONFIG_FILE_FORMAT, version: MODEL_CONFIG_FILE_VERSION + 1 }),
    ).toEqual({ ok: false, error: "newer_version" });
  });

  it.each([
    ["not JSON", "{", "invalid_json"],
    ["another file", { format: "something-else", version: 1 }, "not_a_model_config"],
    ["no version", { format: MODEL_CONFIG_FILE_FORMAT }, "not_a_model_config"],
    [
      "an invalid model id",
      { format: MODEL_CONFIG_FILE_FORMAT, version: 2, tasks: { assistant_model: { model: 42 } } },
      "invalid_value",
    ],
    [
      "an unknown reasoning level",
      { format: MODEL_CONFIG_FILE_FORMAT, version: 2, reasoningLevel: "extreme" },
      "invalid_value",
    ],
  ])("refuses %s", (_label, input, error) => {
    const parsed = parseModelConfigFile(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe(error);
  });

  it("leaves out, and names, the entries this release does not know", () => {
    const parsed = parseModelConfigFile({
      format: MODEL_CONFIG_FILE_FORMAT,
      version: MODEL_CONFIG_FILE_VERSION,
      categories: { video: { model: "x/y" } },
      tasks: { fallback_model: { model: "x/y" } },
    });
    expect(parsed.ok && parsed.ignored).toEqual(["categories.video", "tasks.fallback_model"]);
  });
});
