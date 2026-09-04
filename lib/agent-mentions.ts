import type { AssistantMention } from "@/lib/assistant-types";
import {
  escapeMentionLabel,
  MENTION_TOKEN_END_PATTERN,
  MENTION_TOKEN_START_PATTERN,
} from "@/lib/mention-token";

const DEFAULT_MAX_AGENT_MENTIONS = 20;
export const MAX_ROUTINE_PROMPT_MENTIONS = 10_000;

const MENTION_TYPES: ReadonlySet<string> = new Set([
  "member",
  "project",
  "issue",
  "objective",
  "page",
]);

/** Validate mentions sent by a composer before they enter an agent run. */
export function parseAgentMentions(
  raw: unknown,
  maxMentions = DEFAULT_MAX_AGENT_MENTIONS,
): AssistantMention[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .filter(
      (v) =>
        MENTION_TYPES.has(v.type as string) &&
        typeof v.id === "string" &&
        v.id.length <= 100 &&
        typeof v.label === "string" &&
        v.label.length > 0 &&
        v.label.length <= 200,
    )
    .slice(0, Math.max(0, maxMentions))
    .map((v) => ({
      type: v.type as AssistantMention["type"],
      id: v.id as string,
      label: v.label as string,
      ...(typeof v.occurrence === "number" &&
      Number.isInteger(v.occurrence) &&
      v.occurrence >= 0 &&
      v.occurrence < MAX_ROUTINE_PROMPT_MENTIONS
        ? { occurrence: v.occurrence }
        : {}),
      ...(typeof v.avatarSeed === "string" && v.avatarSeed.length <= 100
        ? { avatarSeed: v.avatarSeed }
        : {}),
      ...(typeof v.color === "string" && v.color.length <= 32
        ? { color: v.color }
        : {}),
      ...(typeof v.icon === "string" && v.icon.length <= 32
        ? { icon: v.icon }
        : {}),
    }));
}

/** Routine prompts can contain every mention occurrence allowed by 20,000 characters. */
export function parseRoutinePromptMentions(raw: unknown): AssistantMention[] {
  return parseAgentMentions(raw, MAX_ROUTINE_PROMPT_MENTIONS);
}

export type AssistantMentionTextSegment =
  | { text: string; mention?: undefined; raw?: undefined }
  | { text?: undefined; mention: AssistantMention; raw: string };

/**
 * Split persisted mention tokens out of text while preserving their stable ids.
 * Homonyms are consumed in their persisted occurrence order.
 */
export function createAssistantMentionTokenSplitter(
  mentions: readonly AssistantMention[],
) {
  const byLabel = new Map<string, AssistantMention[]>();
  for (const mention of mentions) {
    if (!mention.label) continue;
    const matches = byLabel.get(mention.label) ?? [];
    matches.push(mention);
    byLabel.set(mention.label, matches);
  }
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length);
  const indexedByLabel = new Map<string, Map<number, AssistantMention>>();
  for (const [label, candidates] of byLabel) {
    const indexed = candidates.filter(
      (mention) => mention.occurrence !== undefined,
    );
    if (indexed.length === 0) continue;
    indexedByLabel.set(
      label,
      new Map(indexed.map((mention) => [mention.occurrence!, mention])),
    );
  }
  const nextOccurrenceByLabel = new Map<string, number>();
  const nextLegacyIndexByLabel = new Map<string, number>();

  return (text: string, hydrate = true): AssistantMentionTextSegment[] => {
    if (labels.length === 0) return [{ text }];
    const expression = new RegExp(
      `${MENTION_TOKEN_START_PATTERN}@(${labels.map(escapeMentionLabel).join("|")})${MENTION_TOKEN_END_PATTERN}`,
      "gu",
    );
    const segments: AssistantMentionTextSegment[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(text)) !== null) {
      if (match.index > last)
        segments.push({ text: text.slice(last, match.index) });
      const candidates = byLabel.get(match[1]) ?? [];
      const occurrence = nextOccurrenceByLabel.get(match[1]) ?? 0;
      nextOccurrenceByLabel.set(match[1], occurrence + 1);
      const indexed = indexedByLabel.get(match[1]);
      const legacyIndex = nextLegacyIndexByLabel.get(match[1]) ?? 0;
      const mention = indexed
        ? indexed.get(occurrence)
        : candidates[Math.min(legacyIndex, candidates.length - 1)];
      if (mention && hydrate) {
        segments.push({ mention, raw: match[0] });
        if (!indexed) nextLegacyIndexByLabel.set(match[1], legacyIndex + 1);
      } else {
        segments.push({ text: match[0] });
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ text: text.slice(last) });
    return segments;
  };
}

export function splitAssistantMentionTokens(
  text: string,
  mentions: readonly AssistantMention[],
): AssistantMentionTextSegment[] {
  return createAssistantMentionTokenSplitter(mentions)(text);
}

/** Give the model the stable ids behind the labels written in a message. */
export function mentionsNote(
  raw: unknown,
  maxMentions = DEFAULT_MAX_AGENT_MENTIONS,
): string {
  const seen = new Set<string>();
  const list = parseAgentMentions(raw, maxMentions).filter((mention) => {
    const key = `${mention.type}:${mention.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (list.length === 0) return "";
  const parts = list.map((m) => {
    if (m.type === "member")
      return `@${m.label} = team member (user id: ${m.id})`;
    if (m.type === "project") return `@${m.label} = project (id: ${m.id})`;
    if (m.type === "issue") return `@${m.label} = issue (id: ${m.id})`;
    if (m.type === "page") {
      return `@${m.label} = wiki page (page id: ${m.id}) — read it with read_page`;
    }
    return `@${m.label} = objective (id: ${m.id})`;
  });
  return `\n\n[Mentions in this message: ${parts.join("; ")}]`;
}

export function promptWithMentions(
  text: string,
  mentions?: unknown,
  maxMentions = DEFAULT_MAX_AGENT_MENTIONS,
): string {
  return `${text}${mentionsNote(mentions, maxMentions)}`;
}

export interface AgentUserMessage {
  /** Durable queue identity used to correlate optimistic bubbles and retries. */
  id?: string;
  text: string;
  mentions?: AssistantMention[];
}

export type AgentMessageInput = AgentUserMessage | string;

export function parseAgentUserMessage(
  raw: AgentMessageInput,
): AgentUserMessage {
  if (typeof raw === "string") return { text: raw };
  const mentions = parseAgentMentions(raw.mentions);
  return {
    ...(raw.id ? { id: raw.id } : {}),
    text: raw.text,
    ...(mentions.length > 0 ? { mentions } : {}),
  };
}
