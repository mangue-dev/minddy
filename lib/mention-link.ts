// The stored form of a mention: a standard Markdown link,
//
//   [@](mention:<type>/<id>[?<metadata>])
//
// with `type` one of `MENTION_TYPES` and `id` the target's stable id. Since
// MIN-872 the link text holds no name: the reader's app resolves the label
// and the figure from the id, so a rename never breaks a mention and a target
// the reader cannot open shows as unavailable without any trace of its name
// (see docs/mentions.md). Metadata a target needs besides its id travels in
// the query: a date's time and end (`mention:date/2026-11-02?time=09:30`), a
// skill's project (`mention:skill/release?project=<uuid>`).
//
// Mentions written between MIN-734 and MIN-872 carry the label their author
// saw (`[@Label](mention:issue/<id>)`). They still parse; the label is never
// shown, and it is kept as stored until the mention is picked again, because
// rewriting a live document on a mere read is refused by the collaboration
// server.
//
// `@Numo` is not a link: it stays the plain-text trigger Numo listens for.
// Forge accounts on pull requests stay `@login`, which the forge resolves.
// Text written before MIN-734 (`@Label` alone) is still read by the label
// scanner (lib/mention-scan.ts) and written back as that text: only a
// mention picked again from the menu becomes typed.

export const MENTION_TYPES = [
  "member",
  "issue",
  "objective",
  "project",
  "page",
  /** An attachment of the surface being written (MIN-742). */
  "resource",
  /** A pull request of a linked repository (MIN-872). */
  "pull_request",
  "routine",
  /** The task notebook as a feature, never one of its tasks: id `notebook`. */
  "scratchpad",
  /** One of the reader's own cycles. */
  "cycle",
  /** A repository skill of a project: id = its folder, `?project=`. */
  "skill",
  /** A connected MCP server of the reader's account. */
  "mcp",
  /** A fixed calendar date, `YYYY-MM-DD`, with `?time=` and `?end=`. */
  "date",
] as const;
export type MentionLinkType = (typeof MENTION_TYPES)[number];

/** Metadata a mention carries besides its id, in written order. */
export type MentionMeta = Record<string, string>;

export interface MentionLink {
  type: MentionLinkType;
  id: string;
  /**
   * The label stored in the link text: empty for every mention written since
   * MIN-872, the author's label for older ones. Never shown to a reader.
   */
  label: string;
  meta?: MentionMeta;
}

/** The fixed id of the task notebook's mention. */
export const SCRATCHPAD_MENTION_ID = "notebook";

const MENTION_SCHEME = "mention:";
const ID = /^[A-Za-z0-9_.-]{1,64}$/;
const META_KEY = /^[a-z]{1,16}$/;
const META_VALUE = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_META_ENTRIES = 4;

export const isMentionLinkType = (value: unknown): value is MentionLinkType =>
  typeof value === "string" && (MENTION_TYPES as readonly string[]).includes(value);

/** The metadata of a query, or `null` when any entry is malformed. */
function parseMeta(query: string): MentionMeta | null {
  const meta: MentionMeta = {};
  const entries = query.split("&");
  if (entries.length > MAX_META_ENTRIES) return null;
  for (const entry of entries) {
    const [key, value, extra] = entry.split("=");
    if (extra !== undefined || !META_KEY.test(key) || !META_VALUE.test(value ?? "") || key in meta) return null;
    meta[key] = value;
  }
  return meta;
}

/** Only well-formed entries, so a mention always writes a parsable address. */
function metaQuery(meta: MentionMeta | null | undefined): string {
  if (!meta) return "";
  const entries = Object.entries(meta)
    .filter(([key, value]) => META_KEY.test(key) && META_VALUE.test(value))
    .slice(0, MAX_META_ENTRIES);
  return entries.length ? `?${entries.map(([key, value]) => `${key}=${value}`).join("&")}` : "";
}

/**
 * Metadata as an editor node keeps it, one attribute string
 * (`time=09:30&end=2026-11-04`), and back. Malformed text reads as none.
 */
export function mentionMetaToAttr(meta: MentionMeta | null | undefined): string | null {
  return metaQuery(meta).slice(1) || null;
}

export function mentionMetaFromAttr(value: unknown): MentionMeta | undefined {
  return typeof value === "string" && value ? parseMeta(value) ?? undefined : undefined;
}

/**
 * The identity of a mention's target: its type and id, and for a skill the
 * project whose repository holds it — two projects may name a skill alike.
 */
export function mentionTargetKey(type: MentionLinkType, id: string, meta?: MentionMeta | null): string {
  return type === "skill" && meta?.project ? `skill:${meta.project}/${id}` : `${type}:${id}`;
}

/** `mention:<type>/<id>[?<metadata>]` */
export function mentionHref(type: MentionLinkType, id: string, meta?: MentionMeta | null): string {
  return `${MENTION_SCHEME}${type}/${id}${metaQuery(meta)}`;
}

/** The target of a `mention:` address, or `null` for any other address. */
export function parseMentionHref(
  href: string | null | undefined,
): { type: MentionLinkType; id: string; meta?: MentionMeta } | null {
  if (!href || !href.startsWith(MENTION_SCHEME)) return null;
  const [path, query, extraQuery] = href.slice(MENTION_SCHEME.length).split("?");
  if (extraQuery !== undefined) return null;
  const [type, id, extra] = path.split("/");
  if (extra !== undefined || !isMentionLinkType(type) || !id || !ID.test(id)) return null;
  if (query === undefined) return { type, id };
  const meta = parseMeta(query);
  return meta ? { type, id, meta } : null;
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

/**
 * The Markdown of one mention. A new mention stores no label (MIN-872);
 * `label` only keeps an older mention's stored text unchanged when its
 * document is written back.
 */
export function mentionMarkdown(
  type: MentionLinkType,
  id: string,
  label = "",
  meta?: MentionMeta | null,
): string {
  return `[@${escapeLabel(label)}](${mentionHref(type, id, meta)})`;
}

/** `[@label](mention:type/id?meta)`, the label with its escapes, bounded. */
const MENTION_LINK =
  /\[@((?:[^\]\\\n]|\\.){0,256})\]\(mention:([a-z_]{1,16})\/([A-Za-z0-9_.-]{1,64})(?:\?([A-Za-z0-9_.:=&-]{1,300}))?\)/g;

/** The parts of one `MENTION_LINK` match as a mention, or `null` when it is not one. */
function linkOf(parts: ReadonlyArray<string | undefined>): MentionLink | null {
  const [, label, type, id, query] = parts;
  if (label === undefined || type === undefined || id === undefined) return null;
  if (!isMentionLinkType(type)) return null;
  const link: MentionLink = { type, id, label: label.replace(/\\(.)/g, "$1") };
  if (query === undefined) return link;
  const meta = parseMeta(query);
  return meta ? { ...link, meta } : null;
}

/**
 * A text split at its mentions, in order: the text between them, and each
 * mention where it was written — whatever escapes its label used.
 */
export function splitMentionLinks(markdown: string): Array<string | MentionLink> {
  if (!markdown.includes("](mention:")) return [markdown];
  const pieces: Array<string | MentionLink> = [];
  let last = 0;
  for (const match of markdown.matchAll(MENTION_LINK)) {
    const link = linkOf(match);
    if (!link) continue;
    pieces.push(markdown.slice(last, match.index));
    pieces.push(link);
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
    const link = linkOf(match);
    if (link) found.push(link);
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
  return markdown.replace(MENTION_LINK, (whole, label?: string, type?: string, id?: string, query?: string) => {
    const link = linkOf([whole, label, type, id, query]);
    if (!link) return whole;
    const next = relabel(link);
    return next === null ? whole : mentionMarkdown(link.type, link.id, next, link.meta);
  });
}

/**
 * The plain text of a Markdown with mentions: `@Label` for each stored label
 * (empty since MIN-872). Relabel the text for its reader first.
 */
export function mentionPlainText(markdown: string): string {
  return markdown.replace(MENTION_LINK, (_whole, label: string) =>
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
  if (at < 0 || text.length - at > MAX_LABEL + 400) return text;
  const tail = text.slice(at);
  return /^\[@(?:[^\]\\\n]|\\.)*(?:\]\(mention:[^)\s]*)?…?$/.test(tail)
    ? `${text.slice(0, at)}@…`
    : text;
}

/**
 * What an agent writes, with its mentions in their stored form. Agents read
 * mentions relabeled for them — the current label, or `unavailable` — so a
 * passage they copy no longer matches the stored text. A mention of a target
 * the stored text already names takes the stored link back; any other is
 * stored like every new mention, without a label (MIN-872).
 */
export function restoreStoredMentions(agentText: string, storedText: string | null | undefined): string {
  if (!agentText.includes("](mention:")) return agentText;
  const stored = new Map<string, string>();
  if (storedText?.includes("](mention:")) {
    for (const match of storedText.matchAll(MENTION_LINK)) {
      const link = linkOf(match);
      if (link && !stored.has(`${link.type}:${link.id}`)) stored.set(`${link.type}:${link.id}`, match[0]);
    }
  }
  return agentText.replace(MENTION_LINK, (whole, label?: string, type?: string, id?: string, query?: string) => {
    const link = linkOf([whole, label, type, id, query]);
    if (!link) return whole;
    return stored.get(`${link.type}:${link.id}`) ?? mentionMarkdown(link.type, link.id, "", link.meta);
  });
}

/**
 * What an agent sends, with every typed mention in its strings stored
 * without a label (MIN-872): the arguments of a Numo or MCP tool, walked
 * value by value. A passage the agent copies still matches the stored text,
 * since each writer maps a mention back to its stored link by its target
 * (`restoreStoredMentions`).
 */
export function withoutMentionLabels<T>(value: T, depth = 0): T {
  if (typeof value === "string") {
    return (value.includes("](mention:") ? restoreStoredMentions(value, null) : value) as T;
  }
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => withoutMentionLabels(item, depth + 1)) as T;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, withoutMentionLabels(item, depth + 1)]),
  ) as T;
}
