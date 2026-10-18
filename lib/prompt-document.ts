// A routine instruction in the shared editor (MIN-728).
//
// The instruction is stored as the plain text an agent reads: one line per
// paragraph, "@Label" for a mention and "/name" for a repository skill. The
// mentions' identities travel next to the text (`AssistantMention`), each
// with its occurrence among the tokens of the same label, so "@Alice" and a
// second, different "@Alice" keep their own ids. These two functions convert
// between that text and the editor document, without Markdown: a prompt has
// no formatting to keep, and Markdown would merge its lines and escape its
// angle brackets.

import type { JSONContent } from "@tiptap/core";
import type { AssistantMention } from "@/lib/assistant-types";
import { splitAssistantMentionTokens } from "@/lib/agent-mentions";
import {
  escapeMentionLabel,
  MENTION_TOKEN_END_PATTERN,
  MENTION_TOKEN_START_PATTERN,
} from "@/lib/mention-token";
import type { RepositorySkillSummary } from "@/lib/repository-skills";

export const PROMPT_SKILL_NODE = "promptSkill";

type Inline = JSONContent | "\n";

function mentionNode(mention: AssistantMention): JSONContent {
  return {
    type: "mention",
    attrs: {
      mentionType: mention.type,
      mentionId: mention.id,
      mentionLabel: mention.label,
      seed: mention.avatarSeed ?? null,
      color: mention.color ?? null,
      icon: mention.icon ?? null,
      status: mention.status ?? null,
    },
  };
}

export function skillNode(skill: RepositorySkillSummary): JSONContent {
  return {
    type: PROMPT_SKILL_NODE,
    attrs: { path: skill.path, name: skill.name, description: skill.description },
  };
}

/** Plain text with the known skills as nodes, line breaks kept as markers. */
function textWithSkills(text: string, skills: readonly RepositorySkillSummary[]): Inline[] {
  const out: Inline[] = [];
  const pushText = (value: string) => {
    value.split("\n").forEach((line, index) => {
      if (index > 0) out.push("\n");
      if (line) out.push({ type: "text", text: line });
    });
  };
  const names = [...skills].sort((a, b) => b.name.length - a.name.length)
    .map((skill) => skill.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (names.length === 0) {
    pushText(text);
    return out;
  }
  const pattern = new RegExp(`(^|\\s)/(${names.join("|")})(?=\\s|$)`, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    pushText(text.slice(last, match.index) + match[1]);
    const skill = skills.find((candidate) => candidate.name === match![2]);
    if (skill) out.push(skillNode(skill));
    last = match.index + match[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/**
 * The editor document of a stored instruction: its saved mentions become
 * pills with their exact ids, the known skills become skill badges, and every
 * line is a paragraph. A token without a saved identity stays text, as in the
 * former field.
 */
export function promptToDocument(
  text: string,
  options: { mentions?: readonly AssistantMention[]; skills?: readonly RepositorySkillSummary[] } = {}
): JSONContent {
  const inline: Inline[] = [];
  for (const segment of splitAssistantMentionTokens(text, options.mentions ?? [])) {
    if (segment.mention !== undefined) inline.push(mentionNode(segment.mention));
    else inline.push(...textWithSkills(segment.text, options.skills ?? []));
  }
  const paragraphs: JSONContent[] = [{ type: "paragraph", content: [] }];
  for (const item of inline) {
    if (item === "\n") paragraphs.push({ type: "paragraph", content: [] });
    else paragraphs[paragraphs.length - 1].content!.push(item);
  }
  return {
    type: "doc",
    content: paragraphs.map((paragraph) =>
      paragraph.content!.length ? paragraph : { type: "paragraph" }),
  };
}

/**
 * The stored form of an editor document: its text, and the identity of each
 * mention pill in document order, with its occurrence among the tokens of
 * the same label in that text.
 */
export function promptFromDocument(doc: JSONContent): { text: string; mentions: AssistantMention[] } {
  const lines: string[] = [];
  const pills: Array<{ offset: number; mention: AssistantMention }> = [];
  let length = 0;
  const visit = (node: JSONContent, line: string[]) => {
    if (node.type === "text") {
      line.push(node.text ?? "");
      length += (node.text ?? "").length;
    } else if (node.type === "mention") {
      const attrs = node.attrs ?? {};
      const label = String(attrs.mentionLabel ?? "");
      const type = attrs.mentionType as AssistantMention["type"] | "numo" | "forge";
      if (attrs.mentionId && type !== "numo" && type !== "forge") {
        pills.push({
          offset: length,
          mention: {
            type,
            id: String(attrs.mentionId),
            label,
            ...(attrs.seed ? { avatarSeed: String(attrs.seed) } : {}),
            ...(attrs.color !== null && attrs.color !== undefined ? { color: String(attrs.color) } : {}),
            ...(attrs.icon !== null && attrs.icon !== undefined ? { icon: String(attrs.icon) } : {}),
            ...(typeof attrs.status === "string" && attrs.status
              ? { status: attrs.status as AssistantMention["status"] }
              : {}),
          },
        });
      }
      line.push(`@${label}`);
      length += label.length + 1;
    } else if (node.type === PROMPT_SKILL_NODE) {
      const name = String(node.attrs?.name ?? "");
      line.push(`/${name}`);
      length += name.length + 1;
    } else if (node.type === "hardBreak") {
      line.push("\n");
      length += 1;
    } else {
      for (const child of node.content ?? []) visit(child, line);
    }
  };
  const blocks = doc.content ?? [];
  blocks.forEach((block, index) => {
    if (index > 0) length += 1;
    const line: string[] = [];
    visit(block, line);
    lines.push(line.join(""));
  });
  const text = lines.join("\n");

  // The occurrence of each pill among the "@Label" tokens of its label, the
  // way the server resolves them (lib/agent-mentions.ts).
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
  const mentions = pills.map(({ offset, mention }) => {
    const occurrence = occurrences.get(`${offset}\0${mention.label}`);
    return occurrence === undefined ? mention : { ...mention, occurrence };
  });
  return { text, mentions };
}
