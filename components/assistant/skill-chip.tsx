"use client";
import { MentionChip } from "@/components/mention-chip";

/** Compact skill badge shared by the composer and sent messages. */
export function SkillChip({
  name,
  className,
  onClick,
}: {
  name: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <MentionChip
      type="skill"
      id={name}
      label={name}
      className={className}
      onClick={onClick}
      ariaHasPopup={onClick ? "dialog" : undefined}
    />
  );
}
