import { cn } from "mangue-ui";
import { Triangle } from "lucide-react";
import {
  EFFORT_MAP,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { RELATION_META } from "@/lib/relation-constants";
import type { IssueRelationType } from "@/lib/types";

/* ── Status ─────────────────────────────────────────────────────────────
   Linear-style ring: dashed (backlog), empty (todo), a pie fill for progress
   (in_progress / in_review). done / canceled / duplicate are filled discs with
   the glyph (check / cross / equals) knocked out as a real hole via an SVG mask,
   so the background shows through. Colors come from the Figma design. */

/** Pie slice from 12 o'clock, clockwise, covering `fraction` of the circle. */
function piePath(cx: number, cy: number, r: number, fraction: number): string {
  const angle = fraction * 2 * Math.PI;
  const ex = cx + r * Math.sin(angle);
  const ey = cy - r * Math.cos(angle);
  const large = fraction > 0.5 ? 1 : 0;
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
}

function Pie({
  color,
  fraction,
  className,
}: {
  color: string;
  fraction: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={cn("size-[19px] shrink-0", className)}>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
      <path d={piePath(8, 8, 3.5, fraction)} fill={color} />
    </svg>
  );
}

export function StatusIndicator({
  status,
  className,
}: {
  status: IssueStatus;
  className?: string;
}) {
  const base = cn("size-[19px] shrink-0", className);
  switch (status) {
    case "triage":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={base}>
          <circle cx="8" cy="8" r="6" stroke="#FA8028" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="8" cy="8" r="2.5" fill="#FA8028" />
        </svg>
      );
    case "backlog":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={cn(base, "text-muted-foreground")}>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
      );
    case "todo":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={cn(base, "text-muted-foreground")}>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "in_progress":
      // Le jaune Figma (#FADB28) est pensé pour le dark ; en light il frôle
      // l'invisible — même teinte, assombrie, pour tenir ~3:1 sur fond clair.
      return (
        <Pie
          color="currentColor"
          fraction={0.5}
          className={cn("text-[#B0890B] dark:text-[#FADB28]", className)}
        />
      );
    case "in_review":
      return <Pie color="#AA41FF" fraction={0.7} className={className} />;
    case "done":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={base}>
          <mask id="status-hole-done">
            <circle cx="8" cy="8" r="6.5" fill="#fff" />
            <path d="M5 8.2 7 10.2 11 6" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </mask>
          <circle cx="8" cy="8" r="6.5" fill="#1DD82C" mask="url(#status-hole-done)" />
        </svg>
      );
    case "canceled":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={base}>
          <mask id="status-hole-canceled">
            <circle cx="8" cy="8" r="6.5" fill="#fff" />
            <path d="M5.8 5.8 10.2 10.2M10.2 5.8 5.8 10.2" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          </mask>
          <circle cx="8" cy="8" r="6.5" fill="#D62115" mask="url(#status-hole-canceled)" />
        </svg>
      );
    case "duplicate":
      return (
        <svg viewBox="0 0 16 16" fill="none" className={base}>
          <mask id="status-hole-duplicate">
            <circle cx="8" cy="8" r="6.5" fill="#fff" />
            <path d="M5.5 6.6h5M5.5 9.4h5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
          </mask>
          <circle cx="8" cy="8" r="6.5" fill="#8E8E93" mask="url(#status-hole-duplicate)" />
        </svg>
      );
  }
}

/* ── Priority ────────────────────────────────────────────────────────────
   Signal bars filled from the bottom (none = all grey, per design); urgent is
   a red rounded square with a "!". The 14×14 glyph is inset in a padded
   viewBox: a solid block reads heavier than the status ring's outline, so it
   needs to be optically smaller at the same box size. */

const PRIORITY_VIEWBOX = "-1.25 -1.25 16.5 16.5";

const PRIORITY_BARS: Record<
  Exclude<IssuePriority, "urgent">,
  { filled: number; color: string }
> = {
  none: { filled: 0, color: "" },
  low: { filled: 1, color: "#1DD82C" },
  medium: { filled: 2, color: "#FADB28" },
  high: { filled: 3, color: "#FA8028" },
};

export function PriorityIndicator({
  priority,
  className,
}: {
  priority: IssuePriority;
  className?: string;
}) {
  if (priority === "urgent") {
    return (
      <svg viewBox={PRIORITY_VIEWBOX} className={cn("size-[17px] shrink-0", className)}>
        <rect width="14" height="14" rx="2" fill="#FA2828" />
        <rect x="6.25" y="3" width="1.5" height="5" rx="0.75" fill="#fff" />
        <circle cx="7" cy="10.2" r="0.9" fill="#fff" />
      </svg>
    );
  }
  const { filled, color } = PRIORITY_BARS[priority];
  return (
    <svg viewBox={PRIORITY_VIEWBOX} className={cn("size-[17px] shrink-0", className)}>
      {[0, 1, 2, 3].map((i) => {
        const on = filled > 0 && i >= 4 - filled;
        return (
          <rect
            key={i}
            x="0"
            y={i * 3.75}
            width="14"
            height="2.75"
            rx="1"
            fill={on ? color : undefined}
            // fill-* (not currentColor) so hovered dropdown rows — which repaint
            // svg `color` via CommandItem's data-selected rule — can't tint them.
            className={on ? undefined : "fill-foreground/20"}
          />
        );
      })}
    </svg>
  );
}

/* ── Relation ────────────────────────────────────────────────────────────
   A lucide glyph tinted per relation type (MIN-25): blocked_by red, blocks
   amber, related muted. Used by the card / side-panel relation chips. */

export function RelationIcon({
  relation,
  className,
}: {
  relation: IssueRelationType;
  className?: string;
}) {
  const { icon: Icon, color } = RELATION_META[relation];
  return <Icon className={cn("size-3.5 shrink-0", color, className)} />;
}

/* ── Effort ──────────────────────────────────────────────────────────────
   A triangle plus the size letter (XS / S / M / L / XL). */

export function EffortIndicator({
  effort,
  className,
}: {
  effort: IssueEffort;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
    >
      <Triangle className="size-[18px] shrink-0" />
      <span className="text-sm font-medium leading-none">
        {EFFORT_MAP[effort].label}
      </span>
    </span>
  );
}
