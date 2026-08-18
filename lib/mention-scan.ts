// What, in a text, IS a mention — the rule, in one place.
//
// It is used twice for the same comment: while it is written (the
// compose rests a pill on each mention it rereads) and once published
// (markdown rendering does the same). Two surfaces, two moments, one rule:
// duplicating the regular expression was giving yourself one more contract
// hold between two files, with the only visible symptom being a pill that
// appears on one side and not the other.

import { displayName } from "@/lib/display-name";
import { PROJECT_KEY_MAX, PROJECT_KEY_MIN } from "@/lib/project-key";
import type { Member } from "@/lib/types";

/** What is written after the “@” to quote a member. */
export function memberLabel(m: Member): string {
  return displayName(m);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* “@numo” is written as you want: this is how the server recognizes it
 (mentionsNumo, lib/server/assistant/comment-agent.ts). A member name,
 is recognized by its EXACT case - this is what extractMentions notifies, and a
 pill must tell the truth about who has been notified. Two rules, one pass:
 as JS does not have a flag per branch, the free case of “numo” is written
 letter by letter. */
const NUMO_PATTERN = "[Nn][Uu][Mm][Oo]";

/* The FORM of a ticket identifier: the project key (2 to 5 capital letters,
 lib/project-key) and its number. The tail guard prevents "@MIN-42x" and
 "@MIN-1234567890" from impersonating "@MIN-42" followed by nothing. */
const ISSUE_IDENTIFIER_PATTERN = `[A-Z]{${PROJECT_KEY_MIN},${PROJECT_KEY_MAX}}-\\d{1,7}(?![\\w-])`;

/** A TICKET such as a mention needs to be known: enough to draw it
 and go there. */
export interface MentionIssue {
  id: string;
  project_id: string;
  /** “MIN-42” — HIM is written after the at sign. */
  identifier: string;
  title: string;
}

/** An OBJECTIVE such as a mention needs to be known. Its color travels
 with it: wherever an icon designates THIS objective, it carries it. */
export interface MentionObjective {
  id: string;
  project_id: string;
  /** The name — it’s what is written after the at sign. */
  name: string;
  color: string | null;
}

/** A PAGE of the wiki such that a mention needs to know it (MIN-273).
 Its icon travels with it: this is what distinguishes “@Guide” from a ticket at first glance, like everywhere else in the app. */
export interface MentionPage {
  id: string;
  project_id: string;
  /** The TITLE — this is what is written after the at sign. */
  title: string;
  /** The page emoji, or null when it takes the default icon. */
  icon: string | null;
}

export type ScannedMention =
  | { type: "numo"; member?: undefined }
  | { type: "member"; member: Member }
  /** A FORGE account (MIN-162): what is mentioned on a pull request,
 where only a GitHub/GitLab account notifies someone. None `user_id` minddy —
 this is precisely what distinguishes it from a `member`. */
  | { type: "forge"; member?: undefined; login: string; avatarUrl: string | null }
  | { type: "issue"; member?: undefined; issue: MentionIssue }
  | { type: "objective"; member?: undefined; objective: MentionObjective }
  | { type: "page"; member?: undefined; page: MentionPage };

/** A piece of bare text, or a recognized statement. Never both.
 `raw` is what was READ in the text ("@Jean Dupont", "@NUMO"): the
 surfaces which replace a mention in place - the description editor, which
 places a node there - need its exact length, which the wording alone does not
 not given (the case of “numo” is free). */
export type MentionSegment =
  | { text: string; mention?: undefined; raw?: undefined }
  | { text?: undefined; mention: ScannedMention; raw: string };

export type MentionScan = (value: string) => MentionSegment[];

/**
 * The division, for a table “what is written after the at sign” → “what
 * designates”. Minddy members and forge accounts are only two
 * fillings: the RULE — the at the beginning of the word, the longest first,
 * "numo" in free case — only exists here, and the two surfaces which reread a
 * same text (the field during typing, the rendering once published) the share.
 */
function buildScanner(
  entries: Array<{ label: string; mention: ScannedMention }>,
  /**
 * Citable tickets, indexed by identifier. They do NOT pass by
 * alternation of names: a workspace has thousands of them, and enumerating them would make a regular expression of several tens of thousands
 * of characters, reconstructed each time the list moves. An identifier
 * can be recognized by its FORM (KEY-number) — the table is only used to say if this
 * ticket exists, and to provide something to draw it.
 */
  issuesByIdentifier?: Map<string, MentionIssue>,
): MentionScan {
  // From longest to shortest: “Jean Dupont” must win over “Jean”, and
  // “@bobby” on “@bob”.
  const byLength = [...entries].sort((a, b) => b.label.length - a.label.length);
  const byName = new Map(byLength.map((e) => [e.label, e.mention]));
  const names = byLength.map((e) => escapeRegExp(e.label));

  // A branch by nature of mention, in order. Each one wears EXACTLY
  // a capturing group, so its rank in `parts` is its group number —
  // this is what allows them to be made optional without shifting the indices.
  // Without entry, no branch of names: an empty “(|)” would match the string
  // empty, and each “@” in the text would become a pill.
  const parts = [`(${NUMO_PATTERN})\\b`];
  let nameGroup = 0;
  let issueGroup = 0;
  if (names.length) {
    parts.push(`(${names.join("|")})`);
    nameGroup = parts.length;
  }
  if (issuesByIdentifier?.size) {
    parts.push(`(${ISSUE_IDENTIFIER_PATTERN})`);
    issueGroup = parts.length;
  }
  const re = new RegExp(`@(?:${parts.join("|")})`, "g");

  return (value: string): MentionSegment[] => {
    const out: MentionSegment[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(value)) !== null) {
      const numo = !!m[1];
      // Same guard as on the server side: “clement@numo.dev” does not cite anyone.
      if (numo && m.index > 0 && !/[\s(>]/.test(value[m.index - 1])) continue;
      const name = nameGroup ? m[nameGroup] : undefined;
      const identifier = issueGroup ? m[issueGroup] : undefined;
      const issue = identifier ? issuesByIdentifier?.get(identifier) : undefined;
      const found: ScannedMention | undefined = numo
        ? { type: "numo" }
        : name
          ? byName.get(name)
          : issue
            ? { type: "issue", issue }
            : undefined;
      // A well-formed but unknown identifier (ticket from another space,
      // typo) rest of the TEXT: a dead pill would lie.
      if (!found) continue;
      if (m.index > last) out.push({ text: value.slice(last, m.index) });
      out.push({ mention: found, raw: m[0] });
      last = m.index + m[0].length;
    }
    if (last < value.length) out.push({ text: value.slice(last) });
    return out;
  };
}

/** Prepares the split for a given list of minddy members. The
 regular expression builds once for all subsequent rereads. */
export function mentionScanner(members: Member[]): MentionScan {
  return buildScanner(
    members.map((member) => ({
      label: memberLabel(member),
      mention: { type: "member", member } as const,
    })),
  );
}

/**
 * The same breakdown, for the accounts of a FORGE (MIN-162). What is written
 * after the at sign is the LOGIN and nothing else — GitHub will solve it,
 * minddy does not transform anything — even when the forge also knows a displayed name.
 */
export function forgeMentionScanner(
  members: Array<{ login: string; avatar_url: string | null }>,
): MentionScan {
  return buildScanner(
    members.map((m) => ({
      label: m.login,
      mention: { type: "forge", login: m.login, avatarUrl: m.avatar_url } as const,
    })),
  );
}

/**
 * The division of a DESCRIPTION: what is cited there is broader than in a
 * comment — a person, a ticket, an objective, a wiki page.
 *
 * The objectives come BEFORE the members in the table: with strictly equal names
 * it is the last pose wins, and between a person and an objective
 * homonyms, it is the person we wanted to cite. Wiki PAGES (MIN-273)
 * are cited in the same way, by their title.
 */
export function contentMentionScanner(source: {
  members?: Member[];
  issues?: MentionIssue[];
  objectives?: MentionObjective[];
  pages?: MentionPage[];
}): MentionScan {
  return buildScanner(
    [
      // The pages first, therefore the least priority on an equal basis: between a
      // page and an objective which have the same name, it is the objective — the object
      // of work — that we wanted to cite, and between the two and a person,
      // it's the person (see the order below).
      ...(source.pages ?? []).map((page) => ({
        label: page.title,
        mention: { type: "page", page } as const,
      })),
      ...(source.objectives ?? []).map((objective) => ({
        label: objective.name,
        mention: { type: "objective", objective } as const,
      })),
      ...(source.members ?? []).map((member) => ({
        label: memberLabel(member),
        mention: { type: "member", member } as const,
      })),
    ],
    new Map((source.issues ?? []).map((issue) => [issue.identifier, issue])),
  );
}
