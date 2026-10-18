"use client";

import { useTranslations } from "next-intl";
import { MentionChip } from "@/components/mention-chip";
import { useMentionLinks } from "@/components/mention-links";
import { mentionMarkdown, type MentionLinkType } from "@/lib/mention-link";
import { useResolvedMentionLabel } from "@/lib/mention-resolution";

/** Marks a typed pill so a copy of rendered text keeps its reference. */
export const MENTION_REF_ATTR = "data-mention-ref";

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
  const links = useMentionLinks();
  const local = links?.label?.(type, id) ?? null;
  const resolved = useResolvedMentionLabel(local ? null : type, local ? null : id);
  const label = local ?? resolved;

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
        status={type === "issue" ? links?.issueStatus(id) ?? undefined : undefined}
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
  const links = useMentionLinks();
  const local = links?.label?.(type, id) ?? null;
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
