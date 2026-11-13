// What Numo cited, lifted to the top of a Numo composer's "@" menu (MIN-969):
// the issues, people, pages, routines and dates of Numo's word on Home and
// of its replies in the conversation, so answering it about them takes one
// keystroke.
//
// A cited target is the option the menu already lists, moved under the
// "Mentioned by Numo" section rather than added a second time. A target the
// menu does not list stays out: it belongs to a hidden project (MIN-751) or
// its source has not loaded yet. Dates are the exception: they have no
// catalog, so a cited date becomes an option of its own.

import { formatMentionDate, mentionDateFrom, mentionDateMeta } from "@/lib/mention-date";
import { mentionLinks, mentionTargetKey, type MentionLink } from "@/lib/mention-link";
import type { MentionOption } from "@/components/mention-suggest";

/** Enough to answer Numo without pushing the rest of the menu off screen. */
export const MAX_NUMO_CITATIONS = 8;

/** A date's identity includes its time and end: Friday and Friday 9:00 differ. */
function citationKey(link: Pick<MentionLink, "type" | "id" | "meta">): string {
  if (link.type !== "date") return mentionTargetKey(link.type, link.id, link.meta);
  return `date:${link.id}|${link.meta?.time ?? ""}|${link.meta?.end ?? ""}`;
}

/**
 * The mentions of Numo's texts, the most recent text first, each target
 * once, as a string that only changes when they do: a reply streaming in
 * rewrites its text at every token, rarely its mentions.
 */
export function numoCitations(texts: ReadonlyArray<string | null | undefined>): string {
  const seen = new Set<string>();
  const links: MentionLink[] = [];
  for (const link of texts.flatMap((text) => mentionLinks(text))) {
    const key = citationKey(link);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ type: link.type, id: link.id, label: "", ...(link.meta ? { meta: link.meta } : {}) });
  }
  return links.length ? JSON.stringify(links) : "";
}

/**
 * `options` with what `citations` (from `numoCitations`) name listed first,
 * under the `fromNumo` section. Returns `options` itself when Numo cited
 * nothing the menu can offer, so the composer keeps its identity.
 */
export function numoCitedMentions(
  options: readonly MentionOption[],
  citations: string,
  locale: string,
  now: Date = new Date(),
): MentionOption[] {
  if (!citations) return options as MentionOption[];
  const links = JSON.parse(citations) as MentionLink[];

  const byKey = new Map<string, MentionOption>();
  for (const option of options) {
    if (option.type === "date" || option.section) continue;
    const key = citationKey({ type: option.type as MentionLink["type"], id: option.id, meta: option.meta });
    if (!byKey.has(key)) byKey.set(key, option);
  }

  const cited: MentionOption[] = [];
  const moved = new Set<MentionOption>();
  for (const link of links) {
    if (cited.length >= MAX_NUMO_CITATIONS) break;
    if (link.type === "date") {
      const value = mentionDateFrom(link.id, link.meta);
      if (!value) continue;
      const meta = mentionDateMeta(value);
      cited.push({
        type: "date",
        id: value.date,
        label: formatMentionDate(value, locale, now),
        ...(meta ? { meta } : {}),
        section: "fromNumo",
      });
      continue;
    }
    const option = byKey.get(citationKey(link));
    if (!option) continue;
    moved.add(option);
    cited.push({ ...option, section: "fromNumo" });
  }

  if (!cited.length) return options as MentionOption[];
  return [...cited, ...options.filter((option) => !moved.has(option))];
}
