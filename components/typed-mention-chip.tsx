"use client";

import { useTranslations } from "next-intl";
import { MentionChip } from "@/components/mention-chip";
import { mentionStatus, useMentionLinks } from "@/components/mention-links";
import { mentionMarkdown, type MentionLinkType } from "@/lib/mention-link";
import {
  rememberShownMention,
  useResolvedMentionLabel,
  useResolvedMentionStatus,
} from "@/lib/mention-resolution";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { useEffect } from "react";

/** Marks a typed pill so a copy of rendered text keeps its reference. */
export const MENTION_REF_ATTR = "data-mention-ref";

/** A label the surface's sources hold: an empty one is a page they know
    without a title, which reads “Untitled”, never “unavailable”. */
function knownLabel(label: string | null, type: MentionLinkType, untitled: string): string | null {
  if (label === null) return null;
  return label || (type === "page" ? untitled : null);
}

/**
 * The pill of a typed mention (MIN-734), in an editor or a rendered text.
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
  appearance,
}: {
  type: MentionLinkType;
  id: string;
  /** The figure an editor node carries (portrait seed, color, emoji, favicon):
   shown only once the reader is known to see the target. */
  appearance?: { seed?: string | null; color?: string | null; icon?: string | null };
}) {
  const t = useTranslations("Common");
  const tPages = useTranslations("Pages");
  const links = useMentionLinks();
  const local = knownLabel(links?.label?.(type, id) ?? null, type, tPages("untitled"));
  // An attachment is mentioned only from the surface that holds it (MIN-742):
  // its pill resolves from that surface's attachments alone, so a mention of
  // another ticket's file reads as unavailable instead of asking the server.
  const scopedOnly = type === "resource";
  const resolved = useResolvedMentionLabel(local || scopedOnly ? null : type, local || scopedOnly ? null : id);
  const label = local ?? (scopedOnly ? null : resolved);
  // An objective's status: from the sources on screen, else from the server
  // resolution (MIN-785) — without it the pill falls back to the target.
  const resolvedStatus = useResolvedMentionStatus(type === "objective" ? type : null, id);
  const status = mentionStatus(links, type, id)
    ?? (resolvedStatus ? OBJECTIVE_STATUS_MAP[resolvedStatus].issueStatus : undefined);
  // A copy of this pill carries what it shows, never its stored label.
  useEffect(() => {
    if (label !== undefined) rememberShownMention(type, id, label);
  }, [type, id, label]);

  if (label === null) {
    return <MentionChip type="unavailable" id={id} label={t("mentionUnavailable")} />;
  }
  const href = label === undefined ? null : links?.href(type, id) ?? null;
  return (
    <span
      {...{ [MENTION_REF_ATTR]: label === undefined ? undefined : mentionMarkdown(type, id, label) }}
      className="contents"
    >
      <MentionChip
        type={type}
        id={id}
        label={label ?? "…"}
        href={href}
        onNavigate={href ? () => links?.navigate(type, id) : undefined}
        status={status ?? undefined}
        tooltip={type === "issue" && label !== undefined ? links?.issueTitle?.(id) ?? null : null}
        avatarSeed={label === undefined ? null : appearance?.seed ?? null}
        color={label === undefined ? null : appearance?.color ?? null}
        iconUrl={label !== undefined && type === "project" ? appearance?.icon ?? null : null}
        icon={label !== undefined && type === "page" ? appearance?.icon ?? null : null}
      />
    </span>
  );
}

/**
 * A typed mention inside plain text — a card's description preview — as
 * `@Label`, with the same rule as the pill: the target's current label, the
 * neutral label when the reader may not see it, and nothing stored.
 */
export function TypedMentionText({ type, id }: { type: MentionLinkType; id: string }) {
  const t = useTranslations("Common");
  const tPages = useTranslations("Pages");
  const links = useMentionLinks();
  const local = knownLabel(links?.label?.(type, id) ?? null, type, tPages("untitled"));
  const resolved = useResolvedMentionLabel(local ? null : type, local ? null : id);
  const label = local ?? resolved;
  return <>@{label === null ? t("mentionUnavailable") : label ?? "…"}</>;
}

/** A plain preview whose typed mentions are rendered with `TypedMentionText`. */
export function PlainPreview({ parts }: { parts: Array<string | { type: MentionLinkType; id: string }> }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string"
          ? part
          : <TypedMentionText key={index} type={part.type} id={part.id} />)}
    </>
  );
}
