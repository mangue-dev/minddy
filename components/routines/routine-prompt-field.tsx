"use client";

import { useTranslations } from "next-intl";

import { DictateButton } from "@/components/ai-elements/dictate-button";
import { MentionLinksProvider } from "@/components/mention-links";
import { MentionTextarea } from "@/components/mention-textarea";
import type { AssistantMention } from "@/lib/assistant-types";
import { containsMentionToken } from "@/lib/mention-token";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useMembersQuery } from "@/lib/use-members-query";
import { useRepositorySkills } from "@/lib/use-repository-skills";

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
  projectId,
  value,
  mentions = [],
  onChange,
  disabled,
  autoFocus,
}: {
  projectId: string;
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
  const repositorySkills = useRepositorySkills(projectId || null);

  const update = (text: string, resolvedMentions: AssistantMention[]) => {
    const nextText = text.slice(0, MAX_PROMPT_LENGTH);
    const nextResolvedMentions = resolvedMentions.filter((mention) =>
      containsMentionToken(nextText, mention.label),
    );
    const resolved = new Set(
      nextResolvedMentions.map((mention) => `${mention.type}:${mention.id}`),
    );
    const preserved = mentions.filter(
      (mention) =>
        containsMentionToken(nextText, mention.label) &&
        !resolved.has(`${mention.type}:${mention.id}`),
    );
    onChange(nextText, [...nextResolvedMentions, ...preserved]);
  };

  return (
    <MentionLinksProvider value={mentionSupport.links ?? null}>
      <div className="relative">
        <MentionTextarea
          autoFocus={autoFocus}
          value={value}
          onChange={update}
          mentions={mentionSupport}
          hydrationMentions={mentions}
          skills={repositorySkills.skills}
          loadSkill={repositorySkills.load}
          disabled={disabled}
          placeholder={t("promptPlaceholder")}
          ariaLabel={t("promptLabel")}
          rows={6}
          dropUp
          portalMenus
          className="max-h-64 min-h-36 pb-12"
        />
        {/* Dictation appends to the existing instruction. */}
        <DictateButton
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
