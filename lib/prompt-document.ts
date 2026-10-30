// A routine instruction in the shared document editor (ticket descriptions,
// plans, pages).
//
// Since MIN-872 the instruction is stored as the editor's Markdown, with
// typed mention links like every other text of the app (`promptFromMarkdown`).
// An instruction saved before stored "@Label" tokens with their identities
// beside the text (`AssistantMention`, with each token's occurrence) and
// "$name" for a repository skill: `promptToMarkdown` reads it back as typed
// pills, and its next save stores the new form.

import type { AssistantMention } from "@/lib/assistant-types";
import { splitAssistantMentionTokens } from "@/lib/agent-mentions";
import { mentionMarkdown, withoutMentionLabels } from "@/lib/mention-link";

/** A repository skill as the instruction names it: `$name`. */
export interface PromptSkill {
  /** The mention id: the skill's folder. */
  id: string;
  name: string;
}

/** `$name`, at the start of the text or after a space, up to a space. */
const SKILL_TOKEN = /(^|[\s(])\$([A-Za-z0-9_.-]{1,64})(?=$|[\s.,;:!?)])/g;

/**
 * The instruction as the shared document editor holds it (ticket
 * descriptions, plans, pages): Markdown where each saved mention is a typed
 * link. The instruction already is Markdown for the agent; only its mentions
 * change form.
 */
export function promptToMarkdown(
  text: string,
  mentions: readonly AssistantMention[],
  skills: { projectId: string; skills: readonly PromptSkill[] } | null = null,
): string {
  const byName = new Map((skills?.skills ?? []).flatMap((skill) => [[skill.name, skill], [skill.id, skill]] as const));
  // A "$name" the project's repository knows reads back as its skill pill.
  const withSkills = (plain: string) => skills && byName.size
    ? plain.replace(SKILL_TOKEN, (whole, before: string, name: string) => {
        const skill = byName.get(name);
        return skill ? `${before}${mentionMarkdown("skill", skill.id, "", { project: skills.projectId })}` : whole;
      })
    : plain;
  return splitAssistantMentionTokens(text, mentions)
    .map((segment) => segment.mention !== undefined
      ? mentionMarkdown(segment.mention.type, segment.mention.id, segment.mention.label)
      : withSkills(segment.text))
    .join("");
}

/**
 * The stored form of the document editor's Markdown (MIN-872): the Markdown
 * itself, every typed mention a link without a label, as in any other text
 * of the app. Numo reads it named for the routine's owner when it runs
 * (lib/server/numo/turns.ts). No identities travel beside it any more.
 */
export function promptFromMarkdown(markdown: string): { text: string; mentions: AssistantMention[] } {
  return { text: withoutMentionLabels(markdown), mentions: [] };
}
