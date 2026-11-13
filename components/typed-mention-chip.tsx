"use client";

import { useLocale, useTranslations } from "next-intl";
import { DateMentionChip } from "@/components/date-mention-chip";
import { MentionChip } from "@/components/mention-chip";
import { mentionStatus, useMentionLinks, type MentionLinks } from "@/components/mention-links";
import {
  isPlanMention,
  mentionMarkdown,
  SCRATCHPAD_MENTION_ID,
  type MentionLinkType,
  type MentionMeta,
} from "@/lib/mention-link";
import { formatMentionDate, mentionDateFrom, type MentionDate } from "@/lib/mention-date";
import { useOptionalScratchpad } from "@/lib/scratchpad-context";
import {
  rememberShownMention,
  useResolvedMentionDetails,
  useResolvedMentionLabel,
} from "@/lib/mention-resolution";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { useEffect } from "react";
import { useOptionalProjects } from "@/lib/projects-context";
import { projectOrbSeed } from "@/lib/project-orb-colors";

/** Marks a typed pill so a copy of rendered text keeps its reference. */
export const MENTION_REF_ATTR = "data-mention-ref";

/** A label the surface's sources hold: an empty one is a page they know
    without a title, which reads “Untitled”, never “unavailable”. */
function knownLabel(label: string | null, type: MentionLinkType, untitled: string): string | null {
  if (label === null) return null;
  return label || (type === "page" ? untitled : null);
}

/** Types whose label never comes from the server: a date is its own value,
    the notebook a feature, and an attachment its surface's (MIN-742). */
const LOCAL_ONLY: ReadonlySet<MentionLinkType> = new Set(["date", "scratchpad", "resource"]);

/** A cycle's label as the server gives it, `Cycle 2026-10-26 → 2026-11-08`,
    in the reader's language. */
function cycleLabel(label: string, locale: string, word: string): string {
  const days = label.match(/\d{4}-\d{2}-\d{2}/g);
  if (!days || days.length !== 2) return label;
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const [start, end] = days.map((day) => {
    const [year, month, date] = day.split("-").map(Number);
    return format.format(new Date(year, month - 1, date));
  });
  return `${word} ${start} – ${end}`;
}

/**
 * The current label of a typed mention for this reader: `undefined` while it
 * resolves, `null` when the reader may not see it. Shared by the pill and the
 * plain-text preview.
 */
function useTypedMentionLabel(
  type: MentionLinkType,
  id: string,
  meta: MentionMeta | undefined,
  links: MentionLinks | null,
  /** Ask the server even when the sources name the target: a pill whose
      figure only the server knows (an MCP logo, a page's emoji, MIN-879). */
  askFigure = false,
): string | null | undefined {
  const tPages = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const local = knownLabel(links?.label?.(type, id, meta) ?? null, type, tPages("untitled"));
  const ownOnly = LOCAL_ONLY.has(type);
  const ask = !ownOnly && (!local || askFigure);
  const resolved = useResolvedMentionLabel(ask ? type : null, ask ? id : null, meta);
  if (type === "scratchpad") return id === SCRATCHPAD_MENTION_ID ? tCommon("mentionScratchpad") : null;
  if (type === "date") {
    const date = mentionDateFrom(id, meta);
    return date ? formatMentionDate(date, locale, null) : null;
  }
  const label = local ?? (ownOnly ? null : resolved);
  return type === "cycle" && label ? cycleLabel(label, locale, tCommon("mentionCycle")) : label;
}

/**
 * The pill of a typed mention (MIN-734, MIN-872), in an editor or a rendered text.
 *
 * Its label is the target's CURRENT label — from the sources already on
 * screen when they hold it, otherwise from the server — and never the label
 * stored with the mention: that one would name a target the reader may not
 * open. A target the reader cannot see shows the neutral unavailable pill,
 * without name, figure or link. While it resolves, the pill shows an
 * ellipsis.
 */
export function TypedMentionChip({
  type,
  id,
  meta,
  appearance,
  onChangeDate,
}: {
  type: MentionLinkType;
  id: string;
  /** What the target needs besides its id: a date's time, a skill's project. */
  meta?: MentionMeta;
  /** The figure an editor node carries (portrait seed, color, emoji, favicon):
   shown only once the reader is known to see the target. */
  appearance?: { seed?: string | null; color?: string | null; icon?: string | null };
  /** In an editor: a date pill opens its picker and writes the new date. */
  onChangeDate?: (next: MentionDate) => void;
}) {
  const t = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const links = useMentionLinks();
  const scratchpad = useOptionalScratchpad();
  // A project mention written as Markdown (a Numo answer, the Home summary)
  // carries no figure, and neither does an editor node read back from stored
  // Markdown (a description preview in a hover card): the user's own project
  // list gives its orb and icon, like a freshly inserted node would.
  const projects = useOptionalProjects()?.projects;
  const known = type === "project" && !appearance?.seed && !appearance?.icon
    ? projects?.find((project) => project.id === id)
    : undefined;
  const figure = known ? { ...appearance, seed: projectOrbSeed(known), icon: known.icon_url ?? null } : appearance;
  // A member written as Markdown carries only their id, which is not their
  // avatar's seed: the server resolution answers it (MIN-964).
  // An MCP pill shows its service's logo, and a page its emoji or the
  // database glyph: the server answers both, so it is asked even when the
  // surface's sources already named the target (MIN-879).
  // A pull request's state colors its pill (MIN-906): the server answers it
  // too, whatever the sources hold.
  const label = useTypedMentionLabel(type, id, meta, links,
    type === "mcp" || type === "page" || type === "pull_request" || (type === "member" && !appearance?.seed));
  // An objective's status (MIN-785), an MCP service, a page's figure: one
  // read of what the resolution returned beside the label.
  const details = useResolvedMentionDetails(
    type === "objective" || type === "mcp" || type === "page" || type === "pull_request" || type === "member" ? type : null, id);
  const mcpService = type === "mcp" ? details?.service : undefined;
  const pageFigure = type === "page" ? details?.page : undefined;
  // From the sources on screen, else from the server resolution — without
  // it the pill falls back to the target.
  const resolvedStatus = type === "objective" ? details?.status : undefined;
  const status = mentionStatus(links, type, id)
    ?? (resolvedStatus ? OBJECTIVE_STATUS_MAP[resolvedStatus].issueStatus : undefined);
  // A copy of this pill carries what it shows, never its stored label.
  useEffect(() => {
    if (label !== undefined) rememberShownMention(type, id, label);
  }, [type, id, label]);

  if (label === null) {
    return <MentionChip type="unavailable" id={id} label={t("mentionUnavailable")} />;
  }
  if (type === "date") {
    const date = mentionDateFrom(id, meta);
    if (date) {
      return (
        <span {...{ [MENTION_REF_ATTR]: mentionMarkdown(type, id, "", meta) }} className="contents">
          <DateMentionChip value={date} onChange={onChangeDate} />
        </span>
      );
    }
  }
  const href = label === undefined ? null : links?.href(type, id) ?? null;
  // An issue's plan (`?part=plan`) is that issue's pill, named after it.
  const shown = label && isPlanMention(type, meta) ? `${label} · ${tPlan("tabPlan")}` : label;
  // The notebook opens in place, over the page being read.
  const openNotebook = type === "scratchpad" && scratchpad ? () => scratchpad.open("mention") : undefined;
  return (
    <span
      {...{ [MENTION_REF_ATTR]: label === undefined ? undefined : mentionMarkdown(type, id, label, meta) }}
      className="contents"
    >
      <MentionChip
        type={type}
        id={id}
        label={shown ?? "…"}
        href={href}
        onNavigate={href ? () => links?.navigate(type, id, meta) : undefined}
        onClick={openNotebook}
        status={status ?? undefined}
        // Once the reader is known to see the target, its hover card says
        // more than the label (MIN-879).
        hoverCard={label === undefined ? undefined : { meta, project: links?.projectId ?? null }}
        mcpService={label === undefined ? null : mcpService ?? null}
        avatarSeed={label === undefined ? null : figure?.seed ?? (type === "member" ? details?.seed : null) ?? null}
        color={label === undefined ? null : figure?.color ?? null}
        iconUrl={label !== undefined && type === "project" ? figure?.icon ?? null : null}
        icon={label !== undefined && type === "page" ? figure?.icon || pageFigure?.icon || null : null}
        database={type === "page" && !!pageFigure?.database}
        prState={label !== undefined && type === "pull_request" ? details?.prState ?? null : null}
      />
    </span>
  );
}

/**
 * A typed mention inside plain text — a card's description preview — as
 * `@Label`, with the same rule as the pill: the target's current label, the
 * neutral label when the reader may not see it, and nothing stored.
 */
export function TypedMentionText({ type, id, meta }: { type: MentionLinkType; id: string; meta?: MentionMeta }) {
  const t = useTranslations("Common");
  const label = useTypedMentionLabel(type, id, meta, useMentionLinks());
  return <>@{label === null ? t("mentionUnavailable") : label ?? "…"}</>;
}

/** A plain preview whose typed mentions are rendered with `TypedMentionText`. */
export function PlainPreview({
  parts,
}: {
  parts: Array<string | { type: MentionLinkType; id: string; meta?: MentionMeta }>;
}) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string"
          ? part
          : <TypedMentionText key={index} type={part.type} id={part.id} meta={part.meta} />)}
    </>
  );
}
