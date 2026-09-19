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

const MAX_TRANSCRIPT_CHARS = 64_000;
const MAX_OUTPUT_CHARS = 64_000;

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
      maxTokens: 8192,
      timeoutMs: 45_000,
    },
  );

  const text =
    typeof result?.text === "string"
      ? normalizeDictationText(result.text, Number.MAX_SAFE_INTEGER)
      : "";
  if (text.length > MAX_OUTPUT_CHARS) return null;
  return /[\p{L}\p{N}]/u.test(text) ? text : null;
}
