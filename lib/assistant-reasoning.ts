import type { AssistantMessage } from "./assistant-types";

/** Keep assistant reasoning traces as compact as code-agent reasoning events. */
export const ASSISTANT_REASONING_MAX_CHARS = 2_000;

export interface AssistantReasoning {
  text: string;
  durationMs: number;
}

export function appendAssistantReasoning(text: string, delta: string): string {
  if (text.length >= ASSISTANT_REASONING_MAX_CHARS) return text;
  return (text + delta).slice(0, ASSISTANT_REASONING_MAX_CHARS);
}

/** Read the durable reasoning trace attached to an assistant message. */
export function assistantMessageReasoning(
  message: AssistantMessage | null | undefined,
): AssistantReasoning | null {
  if (!message || message.role !== "assistant") return null;
  const raw = message.metadata?.reasoning;
  if (!raw || typeof raw !== "object") return null;

  const text = (raw as { text?: unknown }).text;
  const durationMs = (raw as { durationMs?: unknown }).durationMs;
  if (typeof text !== "string" || !text.trim()) return null;

  return {
    text: text.slice(0, ASSISTANT_REASONING_MAX_CHARS),
    durationMs:
      typeof durationMs === "number" && Number.isFinite(durationMs)
        ? Math.max(0, durationMs)
        : 0,
  };
}
