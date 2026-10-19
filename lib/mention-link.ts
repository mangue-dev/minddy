// The stored form of a mention (MIN-734): a standard Markdown link,
//
//   [@Label](mention:<type>/<id>)
//
// with `type` one of member, issue, objective, project, page, resource and
// `id` the target's stable id. A `resource` is an attachment (MIN-742),
// mentioned only from the surface that holds it. Every reader of the Markdown sees `@Label` — an agent,
// a webhook, GitHub, which renders an unknown scheme as plain text — while
// the app resolves the id: the pill follows renames, a homonym can no longer
// take its place, and a target the reader cannot open is shown as
// unavailable, without its name (see docs/mentions.md).
//
// `@Numo` is not a link: it stays the plain-text trigger Numo listens for.
// Forge accounts on pull requests stay `@login`, which the forge resolves.
// Text written before this format (`@Label` alone) is still read by the
// label scanner (lib/mention-scan.ts) and written back as that text: only a
// mention picked again from the menu becomes typed (docs/mentions.md).

export const MENTION_TYPES = ["member", "issue", "objective", "project", "page", "resource"] as const;
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

/** The longest label a mention keeps, so parsing stays linear on any text. */
const MAX_LABEL = 256;

/**
 * A label as Markdown link text. Every Markdown punctuation is escaped, not
 * only the brackets: `*b*` or a backtick would otherwise read back as emphasis
 * or code and change the label, and a `|` would split a table cell.
 */
function escapeLabel(label: string): string {
  return label.slice(0, MAX_LABEL).replace(/\s*\n\s*/g, " ").replace(/[\\[\]*_`~<>&|!#]/g, "\\$&");
}

/** The Markdown of one mention. */
export function mentionMarkdown(type: MentionLinkType, id: string, label: string): string {
  return `[@${escapeLabel(label)}](${mentionHref(type, id)})`;
}

/** `[@label](mention:type/id)`, the label with its escapes, bounded. */
const MENTION_LINK = /\[@((?:[^\]\\\n]|\\.){0,256})\]\(mention:([a-z]{1,16})\/([A-Za-z0-9_-]{1,64})\)/g;

/**
 * A text split at its mentions, in order: the text between them, and each
 * mention where it was written — whatever escapes its label used.
 */
export function splitMentionLinks(markdown: string): Array<string | MentionLink> {
  if (!markdown.includes("](mention:")) return [markdown];
  const pieces: Array<string | MentionLink> = [];
  let last = 0;
  for (const match of markdown.matchAll(MENTION_LINK)) {
    if (!isMentionLinkType(match[2])) continue;
    pieces.push(markdown.slice(last, match.index));
    pieces.push({ type: match[2], id: match[3], label: match[1].replace(/\\(.)/g, "$1") });
    last = match.index + match[0].length;
  }
  pieces.push(markdown.slice(last));
  return pieces.filter((piece) => piece !== "");
}

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
  // Only the end of a text can hold a cut mention: look at its tail alone,
  // so this stays linear on any text an agent reads.
  const at = text.lastIndexOf("[@");
  if (at < 0 || text.length - at > MAX_LABEL + 100) return text;
  const tail = text.slice(at);
  return /^\[@(?:[^\]\\\n]|\\.)*(?:\]\(mention:[^)\s]*)?…?$/.test(tail)
    ? `${text.slice(0, at)}@…`
    : text;
}

/**
 * What an agent writes, with each mention it copied back to its stored form
 * (MIN-734). Agents read mentions relabeled for them — the current label, or
 * `unavailable` — so a passage they copy no longer matches the stored text,
 * and a rewrite would store their label in place of the author's. A mention
 * of a target the stored text already names takes the stored link back; a
 * new mention is kept as written.
 */
export function restoreStoredMentions(agentText: string, storedText: string | null | undefined): string {
  if (!storedText || !agentText.includes("](mention:") || !storedText.includes("](mention:")) {
    return agentText;
  }
  const stored = new Map<string, string>();
  for (const match of storedText.matchAll(MENTION_LINK)) {
    const key = `${match[2]}:${match[3]}`;
    if (!stored.has(key)) stored.set(key, match[0]);
  }
  return agentText.replace(MENTION_LINK, (whole, _label: string, type: string, id: string) =>
    stored.get(`${type}:${id}`) ?? whole);
}
