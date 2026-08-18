"use client";

import { Textarea } from "mangue-ui";
import { useTranslations } from "next-intl";

import { DictateButton } from "@/components/ai-elements/dictate-button";

/** Hard ceiling of an instruction, server side like here (`MAX_PROMPT_LENGTH`). */
const MAX_PROMPT_LENGTH = 20000;

/**
 * The INSTRUCTION field of a routine — the same at creation (`job` step of the
 * wizard) and at modification (the detail pane). A single component because
 * we rewrite an instruction in exactly the conditions in which we
 * wrote it: same dictation, same input ceiling, same height.
 *
 * **The height is limited, and that's the point.** The `Textarea` of mango-ui is
 * in `field-sizing-content`: it grows with its content, endlessly. A
 * routine instruction being a specification of several thousand
 * signs, the field reached several thousand pixels and pushed everything that
 * which followed it - the cadence, and especially the "Save" button - off
 * the screen. `max-h-64` stops it at around ten lines; beyond that, it's the
 * field that scrolls, like any text editor.
 *
 * `pb-12` reserves the corner where the dictation button floats: without it, the last
 * line passes underneath.
 */
export function RoutinePromptField({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Grays out dictation during writing in progress (creation, recording). */
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations("Routines");

  return (
    <div className="relative">
      <Textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("promptPlaceholder")}
        aria-label={t("promptLabel")}
        maxLength={MAX_PROMPT_LENGTH}
        rows={6}
        className="max-h-64 min-h-36 resize-none overflow-y-auto pb-12"
      />
      {/* Dictation ADDS to what is already there, it does not replace it: on
 completes a voice instruction as often as one dictates one. */}
      <DictateButton
        floating
        disabled={disabled}
        onTranscription={(text) =>
          onChange(value.trim() ? `${value.trim()} ${text}` : text)
        }
      />
    </div>
  );
}
