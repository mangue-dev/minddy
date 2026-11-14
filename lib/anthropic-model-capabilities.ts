/**
 * What Anthropic's `GET /v1/models` publishes about each Claude model's
 * thinking and effort support (MIN-979), kept per process so the reasoning
 * rules (`lib/model-reasoning-rules.ts`) follow the provider rather than a
 * table of family names. The listing (`lib/server/agent/models-catalog.ts`)
 * and the Anthropic transport (`lib/server/ai-runtime.ts`) fill it; a model
 * it does not know, or a process that never listed it (the browser), falls
 * back to the family rules.
 *
 * Pure module: no server-only import, so the rules stay shared.
 */

import type { ReasoningLevel } from "./agent-reasoning";

/** The fields of `capabilities` the reasoning rules read. */
export interface ClaudeThinkingCapabilities {
  /** The model thinks at all. */
  thinking: boolean;
  adaptive: boolean;
  /** Manual `budget_tokens` thinking. */
  manual: boolean;
  /** `thinking: {type: "disabled"}` is accepted. */
  canDisable: boolean;
  /** Accepted `output_config.effort` values, cheapest first; empty without effort support. */
  efforts: ReasoningLevel[];
}

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;

const capabilitiesByModel = new Map<string, ClaudeThinkingCapabilities>();

function supported(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { supported?: unknown }).supported === true);
}

/**
 * A model entry's `capabilities` → the thinking profile, or `null` when the
 * entry carries none (the field is nullable) or not in the documented shape.
 * Each thinking type is `{supported: bool}`; `effort.xhigh` may be `null`,
 * read as unsupported.
 */
export function parseClaudeCapabilities(raw: unknown): ClaudeThinkingCapabilities | null {
  if (!raw || typeof raw !== "object") return null;
  const capabilities = raw as {
    thinking?: { supported?: unknown; types?: Record<string, unknown> };
    effort?: Record<string, unknown> & { supported?: unknown };
  };
  const thinking = capabilities.thinking;
  if (!thinking || typeof thinking !== "object" || !thinking.types || typeof thinking.types !== "object") {
    return null;
  }
  const effort = capabilities.effort;
  const efforts: ReasoningLevel[] = supported(effort)
    ? EFFORT_LEVELS.filter((level) => supported(effort?.[level]))
    : [];
  return {
    thinking: supported(thinking),
    adaptive: supported(thinking.types.adaptive),
    manual: supported(thinking.types.enabled),
    canDisable: supported(thinking.types.disabled),
    efforts,
  };
}

/** Records what a listing or a model lookup published. */
export function rememberClaudeCapabilities(model: string, capabilities: ClaudeThinkingCapabilities | null): void {
  if (capabilities) capabilitiesByModel.set(model.toLowerCase(), capabilities);
}

/** The published profile of a model, or `undefined` when none was seen. */
export function claudeCapabilities(model: string): ClaudeThinkingCapabilities | undefined {
  return capabilitiesByModel.get(model.toLowerCase());
}

/** Test reset: the cache is process state. */
export function resetClaudeCapabilities(): void {
  capabilitiesByModel.clear();
}
