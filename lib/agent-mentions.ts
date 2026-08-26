import type { AssistantMention } from "@/lib/assistant-types";

const MENTION_TYPES: ReadonlySet<string> = new Set([
  "member",
  "project",
  "issue",
  "objective",
  "page",
]);

/** Validate mentions sent by a composer before they enter an agent run. */
export function parseAgentMentions(raw: unknown): AssistantMention[] {
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
    .slice(0, 20)
    .map((v) => ({
      type: v.type as AssistantMention["type"],
      id: v.id as string,
      label: v.label as string,
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

/** Give the model the stable ids behind the labels written in a message. */
export function mentionsNote(raw: unknown): string {
  const list = parseAgentMentions(raw);
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

export function promptWithMentions(text: string, mentions?: unknown): string {
  return `${text}${mentionsNote(mentions)}`;
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
