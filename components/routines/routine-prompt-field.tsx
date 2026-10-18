"use client";

import { useTranslations } from "next-intl";

import { DictateButton } from "@/components/ai-elements/dictate-button";
import { MentionLinksProvider } from "@/components/mention-links";
import { PromptEditor } from "@/components/editor/prompt-editor";
import type { AssistantMention } from "@/lib/assistant-types";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useMembersQuery } from "@/lib/use-members-query";
import { useRepositorySkills } from "@/lib/use-repository-skills";

/** Hard ceiling of an instruction, server side like here (`MAX_PROMPT_LENGTH`). */
const MAX_PROMPT_LENGTH = 20000;

/**
 * The INSTRUCTION field of a routine — the same at creation (`job` step of the
 * wizard) and at modification (the detail pane). A single component because
 * we rewrite an instruction in exactly the conditions in which we
 * wrote it: same dictation, same input ceiling, same height. It runs the
 * shared editor (MIN-728, components/editor/prompt-editor.tsx) and stores the
 * same plain text and mention identities as before.
 *
 * **The height is limited, and that's the point.** An instruction can be a
 * specification of several thousand characters: unbounded, the field pushed
 * the cadence and the "Save" button off the screen. `max-h-64` stops it at
 * around ten lines; beyond that, the field scrolls, like any text editor.
 *
 * `pb-12` reserves the corner where the dictation button floats: without it, the last
 * line passes underneath.
 */
export function RoutinePromptField({
  projectId,
  baseBranch,
  value,
  mentions = [],
  onChange,
  disabled,
  autoFocus,
}: {
  projectId: string;
  baseBranch?: string | null;
  value: string;
  mentions?: AssistantMention[];
  onChange: (value: string, mentions: AssistantMention[]) => void;
  /** Grays out dictation during writing in progress (creation, recording). */
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations("Routines");
  const { members } = useMembersQuery(projectId || null, !!projectId);
  const mentionSupport = useDescriptionMentions(projectId || null, members);
  const repositorySkills = useRepositorySkills(
    projectId || null,
    "cloud",
    "routine-prompt",
    baseBranch?.trim() || null,
  );

  const update = (text: string, resolvedMentions: AssistantMention[]) => {
    const nextText = text.slice(0, MAX_PROMPT_LENGTH);
    // The editor emits the exact chip occurrences from its DOM. Re-inferring
    // them from labels would make "Alice" ambiguous with "Alice Smith".
    onChange(nextText, text === nextText ? resolvedMentions : []);
  };

  return (
    <MentionLinksProvider value={mentionSupport.links ?? null}>
      <div className="relative">
        <PromptEditor
          autoFocus={autoFocus}
          value={value}
          mentions={mentions}
          onChange={update}
          mentionSources={mentionSupport}
          skills={repositorySkills.skills}
          loadSkill={repositorySkills.load}
          disabled={disabled}
          placeholder={t("promptPlaceholder")}
          ariaLabel={t("promptLabel")}
          className="max-h-64 min-h-36 overflow-y-auto rounded-lg border border-input text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          contentClassName="px-3 pt-2 pb-12 [&_p]:my-0"
        />
        {/* Dictation appends to the existing instruction. */}
        <DictateButton
          context="routine_instruction"
          floating
          disabled={disabled}
          onTranscription={(text) =>
            update(value.trim() ? `${value.trim()} ${text}` : text, mentions)
          }
        />
      </div>
    </MentionLinksProvider>
  );
}
