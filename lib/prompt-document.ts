// A routine instruction in the shared document editor (ticket descriptions,
// plans, pages).
//
// The instruction is stored as the text an agent reads: Markdown with
// "@Label" for a mention and "$name" for a repository skill. The mentions'
// identities travel next to the text (`AssistantMention`), each with its
// occurrence among the tokens of the same label, so "@Alice" and a second,
// different "@Alice" keep their own ids. The editor's Markdown carries
// mentions as typed links instead: `promptToMarkdown` and
// `promptFromMarkdown` convert between the two.

import type { AssistantMention } from "@/lib/assistant-types";
import { splitAssistantMentionTokens } from "@/lib/agent-mentions";
import {
  escapeMentionLabel,
  MENTION_TOKEN_END_PATTERN,
  MENTION_TOKEN_START_PATTERN,
} from "@/lib/mention-token";
import { isMentionLinkType, mentionMarkdown, splitMentionLinks } from "@/lib/mention-link";

/**
 * Each pill's occurrence among the "@Label" tokens of its label in `text`,
 * the way the server resolves them (lib/agent-mentions.ts).
 */
function withOccurrences(
  text: string,
  pills: ReadonlyArray<{ offset: number; mention: AssistantMention }>,
): AssistantMention[] {
  const occurrences = new Map<string, number>();
  const labels = [...new Set(pills.map(({ mention }) => mention.label))]
    .sort((a, b) => b.length - a.length);
  if (labels.length > 0) {
    const expression = new RegExp(
      `${MENTION_TOKEN_START_PATTERN}@(${labels.map(escapeMentionLabel).join("|")})${MENTION_TOKEN_END_PATTERN}`,
      "gu",
    );
    const next = new Map<string, number>();
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) {
      const count = next.get(match[1]) ?? 0;
      occurrences.set(`${match.index}\0${match[1]}`, count);
      next.set(match[1], count + 1);
    }
  }
  return pills.map(({ offset, mention }) => {
    const occurrence = occurrences.get(`${offset}\0${mention.label}`);
    return occurrence === undefined ? mention : { ...mention, occurrence };
  });
}

/**
 * The instruction as the shared document editor holds it (ticket
 * descriptions, plans, pages): Markdown where each saved mention is a typed
 * link. The instruction already is Markdown for the agent; only its mentions
 * change form.
 */
export function promptToMarkdown(text: string, mentions: readonly AssistantMention[]): string {
  return splitAssistantMentionTokens(text, mentions)
    .map((segment) => segment.mention !== undefined
      ? mentionMarkdown(segment.mention.type, segment.mention.id, segment.mention.label)
      : segment.text)
    .join("");
}

/**
 * The stored form of the document editor's Markdown: "@Label" for each typed
 * mention, with its identity and occurrence. A mention kept from `previous`
 * keeps the display details saved with it (portrait, color, status).
 */
export function promptFromMarkdown(
  markdown: string,
  previous: readonly AssistantMention[] = [],
): { text: string; mentions: AssistantMention[] } {
  const pills: Array<{ offset: number; mention: AssistantMention }> = [];
  let text = "";
  for (const piece of splitMentionLinks(markdown)) {
    if (typeof piece === "string") {
      text += piece;
      continue;
    }
    const token = `@${piece.label}`;
    // An attachment is not an entity a routine run carries: its label stays text.
    if (isMentionLinkType(piece.type) && piece.type !== "resource") {
      const saved = previous.find((mention) => mention.type === piece.type && mention.id === piece.id);
      const { occurrence: _occurrence, ...details } = saved ?? { type: piece.type, id: piece.id, label: piece.label };
      pills.push({ offset: text.length, mention: { ...details, type: piece.type, id: piece.id, label: piece.label } });
    }
    text += token;
  }
  return { text, mentions: withOccurrences(text, pills) };
}
