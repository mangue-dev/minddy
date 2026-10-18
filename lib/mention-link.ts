// The stored form of a mention (MIN-734): a standard Markdown link,
//
//   [@Label](mention:<type>/<id>)
//
// with `type` one of member, issue, objective, project, page and `id` the
// target's stable id. Every reader of the Markdown sees `@Label` — an agent,
// a webhook, GitHub, which renders an unknown scheme as plain text — while
// the app resolves the id: the pill follows renames, a homonym can no longer
// take its place, and a target the reader cannot open is shown as
// unavailable, without its name (see docs/mentions.md).
//
// `@Numo` is not a link: it stays the plain-text trigger Numo listens for.
// Forge accounts on pull requests stay `@login`, which the forge resolves.
// Text written before this format (`@Label` alone) is still read by the
// label scanner (lib/mention-scan.ts) and written back as a link by the next
// editor save.

export const MENTION_TYPES = ["member", "issue", "objective", "project", "page"] as const;
export type MentionLinkType = (typeof MENTION_TYPES)[number];

export interface MentionLink {
  type: MentionLinkType;
  id: string;
  /** The label written when the mention was made (without the "@"). */
  label: string;
}

const MENTION_SCHEME = "mention:";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const isMentionLinkType = (value: unknown): value is MentionLinkType =>
  typeof value === "string" && (MENTION_TYPES as readonly string[]).includes(value);

/** `mention:<type>/<id>` */
export function mentionHref(type: MentionLinkType, id: string): string {
  return `${MENTION_SCHEME}${type}/${id}`;
}

/** The target of a `mention:` address, or `null` for any other address. */
export function parseMentionHref(href: string | null | undefined): { type: MentionLinkType; id: string } | null {
  if (!href || !href.startsWith(MENTION_SCHEME)) return null;
  const [type, id, extra] = href.slice(MENTION_SCHEME.length).split("/");
  if (extra !== undefined || !isMentionLinkType(type) || !id || !ID.test(id)) return null;
  return { type, id };
}

/** A label as Markdown link text: brackets and backslashes escaped. */
function escapeLabel(label: string): string {
  return label.replace(/[\\[\]]/g, "\\$&").replace(/\s*\n\s*/g, " ");
}

/** The Markdown of one mention. */
export function mentionMarkdown(type: MentionLinkType, id: string, label: string): string {
  return `[@${escapeLabel(label)}](${mentionHref(type, id)})`;
}

/** `[@label](mention:type/id)`, the label with its escapes. */
const MENTION_LINK = /\[@((?:[^\]\\\n]|\\.)*)\]\(mention:([a-z]+)\/([A-Za-z0-9_-]{1,64})\)/g;

/** Every mention a Markdown text makes, in order. */
export function mentionLinks(markdown: string | null | undefined): MentionLink[] {
  if (!markdown || !markdown.includes("](mention:")) return [];
  const found: MentionLink[] = [];
  for (const match of markdown.matchAll(MENTION_LINK)) {
    if (!isMentionLinkType(match[2])) continue;
    found.push({ type: match[2], id: match[3], label: match[1].replace(/\\(.)/g, "$1") });
  }
  return found;
}

/** The ids of one type a text mentions, each once. */
export function mentionedIds(markdown: string | null | undefined, type: MentionLinkType): string[] {
  return [...new Set(mentionLinks(markdown).filter((link) => link.type === type).map((link) => link.id))];
}

/**
 * Rewrite every mention's label: `relabel` receives each mention and returns
 * the label to show, or `null` to keep it. The reference itself never moves.
 */
export function relabelMentions(
  markdown: string,
  relabel: (link: MentionLink) => string | null
): string {
  if (!markdown.includes("](mention:")) return markdown;
  return markdown.replace(MENTION_LINK, (whole, label: string, type: string, id: string) => {
    if (!isMentionLinkType(type)) return whole;
    const next = relabel({ type, id, label: label.replace(/\\(.)/g, "$1") });
    return next === null ? whole : mentionMarkdown(type, id, next);
  });
}

/**
 * The plain text of a Markdown with mentions: `@Label` for each, as a human
 * or an agent reads it.
 */
export function mentionPlainText(markdown: string): string {
  return relabelMentions(markdown, () => null).replace(MENTION_LINK, (_whole, label: string) =>
    `@${label.replace(/\\(.)/g, "$1")}`);
}

/**
 * A mention cut by a truncation (a list's 200-character description) keeps
 * no part of its label: `[@Secret ro…` or `[@Secret](mention:page/12…` at the
 * end of a text becomes `@…`.
 */
export function stripCutMention(text: string): string {
  if (!text.includes("[@")) return text;
  return text.replace(/\[@[^\]\n]*(?:\]\(mention:[^)\s]*)?…?$/, "@…");
}
