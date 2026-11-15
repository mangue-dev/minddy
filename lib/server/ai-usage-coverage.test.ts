import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MIN-1001 — every paid AI call lands in `ai_usage`. `forcedToolCall` and
 * the embedding helpers require a `record` in their types; this test covers
 * the modules that call a provider directly: each one writes the ledger, or
 * hands what it spent to a caller that does. A new direct call fails here
 * until it does one or the other, or is listed below with its reason.
 */

const ROOT = join(__dirname, "..", "..");

/** A direct provider call: chat, transcription, web search, raw transport. */
const PROVIDER_CALL = /\b(?:fetchAiChat|fetchOpenRouterWithSuffixFallback|transcribeAudio|runWebSearch|fetchAiProvider)\(/;

/** Writes the ledger itself, or returns what it spent for its caller to record. */
const LEDGER = /\brecordAiUsage\b|\brecordUsage\b|\bonGeneration\b|\bAiUsageInput\b|\bGenerationInfo\b/;

/** Modules that call a provider without spending anything a ledger line could hold. */
const EXEMPT: Record<string, string> = {
  "lib/server/ai-runtime.ts": "defines fetchAiChat; its callers record",
  "lib/server/ai-provider-request.ts": "the raw transport under fetchAiChat",
  "lib/server/model-config.ts": "defines fetchOpenRouterWithSuffixFallback; its callers record",
  "lib/server/openrouter-transcribe.ts": "defines transcribeAudio, which returns tokens and cost to its callers",
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("AI usage ledger coverage", () => {
  const files = [...sources(join(ROOT, "lib")), ...sources(join(ROOT, "app"))]
    .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))
    .filter((file) => PROVIDER_CALL.test(file.text));

  it("finds the provider calls it guards", () => {
    expect(files.map((file) => file.path)).toContain("lib/server/feedback/forced-tool-call.ts");
  });

  it("records every direct provider call, or hands its cost to a caller that does", () => {
    const unrecorded = files
      .filter((file) => !Object.hasOwn(EXEMPT, file.path) && !LEDGER.test(file.text))
      .map((file) => file.path);
    expect(unrecorded).toEqual([]);
  });

  it("keeps the exemptions to modules that still call a provider", () => {
    const callers = new Set(files.map((file) => file.path));
    for (const path of Object.keys(EXEMPT)) expect(callers.has(path), path).toBe(true);
  });
});
