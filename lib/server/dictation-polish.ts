import "server-only";

import {
  buildDictationPolishPrompt,
  normalizeDictationText,
  type DictationContext,
} from "@/lib/dictation-context";
import {
  forcedToolCall,
  type ForcedToolCallRecord,
} from "@/lib/server/feedback/forced-tool-call";
import { resolveConfiguredModel } from "@/lib/server/model-config";

// A token-dense transcript can approach three output tokens per UTF-16 code
// unit once the forced tool-call JSON is included. Keep the accepted input
// below one third of the output allowance so every accepted transcript has
// room for a faithful cleaned copy and the structured-output envelope.
const MAX_TRANSCRIPT_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_OUTPUT_TOKENS = 65_536;

const DELIVER_DICTATION_PARAMETERS = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "The cleaned dictation, ready for its stated destination.",
    },
  },
  required: ["text"],
  additionalProperties: false,
} as const;

export async function polishDictationTranscript({
  transcript,
  context,
  record,
  surface = "voice",
}: {
  transcript: string;
  context: DictationContext;
  record: ForcedToolCallRecord;
  surface?: "voice" | "feedback";
}): Promise<string | null> {
  const source = normalizeDictationText(transcript, Number.MAX_SAFE_INTEGER);
  // Oversized takes remain usable as raw text instead of being silently
  // shortened by an editorial pass that cannot fit its full input or output.
  if (source.length > MAX_TRANSCRIPT_CHARS) return null;
  if (!/[\p{L}\p{N}]/u.test(source)) return null;

  const { model } = await resolveConfiguredModel("dictate_model");
  const result = await forcedToolCall(
    model,
    buildDictationPolishPrompt(context),
    source,
    "deliver_dictation",
    DELIVER_DICTATION_PARAMETERS,
    {
      xTitle: "minddy Dictation cleanup",
      logPrefix: "[dictation-polish]",
      record,
      modelKey: "dictate_model",
      surface,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: 90_000,
    },
  );

  const text =
    typeof result?.text === "string"
      ? normalizeDictationText(result.text, Number.MAX_SAFE_INTEGER)
      : "";
  if (text.length > MAX_OUTPUT_CHARS) return null;
  return /[\p{L}\p{N}]/u.test(text) ? text : null;
}
