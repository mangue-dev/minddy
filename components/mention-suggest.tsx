"use client";

// What can be cited by “@”, and what it looks like in a list of
// suggestions.
//
// A single table for the two surfaces which open an “@”: compose it from
// Numo (contentEditable, list placed above) and the description editor
// (tiptap, menu brought to the body of the document). They don't share their box —
// one is anchored to the composer, the other to the caret — but they share the
// FIGURE and the LINE: a person, a project, a ticket, an objective, a page
// from the wiki are recognized by the same sign on both sides.

import { HugeiconsIcon } from "@hugeicons/react";
import { Book02Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ObjectiveIconBadge } from "@/components/objective-icon";
import { ProjectOrb } from "@/components/project-orb";
import { UserAvatar } from "@/components/user-avatar";
import { NumoFace } from "@/components/numo-face";
import { filterMentionItems } from "@/lib/mention-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { SemanticSearchingHint, type SemanticSearchStatus } from "@/components/semantic-searching-hint";
import type { IssueStatus } from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-validation";

export interface MentionOption {
  /** Source project for contextual mentions retained across navigation. */
  projectId?: string;
  type:
    | "member"
    /** A FORGE account (MIN-162): the login is what is written, the portrait
        comes from the forge itself. */
    | "forge"
    /** The assistant, offerable only where minddy processes the mention. */
    | "numo"
    | "project"
    | "issue"
    | "objective"
    | "page"
    /** An attachment of the surface being written (MIN-742). */
    | "resource";
  id: string;
  /** What is written after the “@”. */
  label: string;
  /** Members: seed of the portrait. Projects: seed of the orb, when the draw
 was restarted (`projectOrbSeed`). */
  avatarSeed?: string;
  /** Projects: the imported favicon, when there is one (otherwise the orb). */
  iconUrl?: string | null;
  /** Objectives: their color, the tint of their pill everywhere else. */
  color?: string | null;
  /** Pages: their emoji, when they have one (MIN-273). */
  icon?: string | null;
  /** Resources: the file type, which picks the same colored icon as the
      attachment chip. A link carries its favicon in `iconUrl` instead. */
  mime?: string | null;
  /** Issues: their live workflow state replaces the generic page glyph. */
  status?: IssueStatus;
  /** Objectives: their status, whose glyph replaces the target (MIN-785). */
  objectiveStatus?: ObjectiveStatus;
  /** Second row of the line: the title of a ticket, the name of the project of an objective. What distinguishes MIN-42 from MIN-43 when choosing. */
  detail?: string;
  /** Search terms in addition to the label (email, project key, title). */
  keywords?: string[];
  /** Appended because it matches the query by meaning (MIN-718), not by text. */
  semantic?: boolean;
}

/** "Related by meaning" divider, shown once before the first semantic option. */
export function SemanticMentionDivider() {
  const t = useTranslations("Picker");
  return (
    <div role="presentation" className="px-2 pb-0.5 pt-1.5 text-xs font-medium text-muted-foreground">
      {t("relatedByMeaning")}
    </div>
  );
}

/** The options that match the query typed after the “@”. */
export function filterMentions(
  options: MentionOption[],
  query: string,
): MentionOption[] {
  return filterMentionItems(options, query);
}

/** The figure of an option — the same as that of its pill once placed. */
export function MentionFigure({
  option,
  className = "size-5",
}: {
  option: MentionOption;
  className?: string;
}) {
  if (option.type === "member") {
    return <UserAvatar seed={option.avatarSeed} className={cn("shrink-0", className)} />;
  }
  if (option.type === "forge") {
    // The forge account bears HIS portrait — github.com serves it, minddy
    // only displays it. The seed stays the fallback when the URL is absent.
    return (
      <UserAvatar
        url={option.iconUrl}
        seed={option.label}
        className={cn("shrink-0", className)}
      />
    );
  }
  if (option.type === "numo") {
    return <NumoFace className={cn("shrink-0", className)} />;
  }
  if (option.type === "project") {
    return (
      <ProjectOrb
        seed={option.avatarSeed ?? option.id}
        iconUrl={option.iconUrl}
        className={className}
      />
    );
  }
  if (option.type === "objective") {
    return (
      <ObjectiveIconBadge
        color={option.color}
        status={option.objectiveStatus}
        className={cn("shrink-0 rounded-full", className)}
        iconClassName="size-3"
      />
    );
  }
  if (option.type === "page") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
          className,
        )}
      >
        {option.icon ? (
          <span className="text-[0.7rem] leading-none">{option.icon}</span>
        ) : (
          <HugeiconsIcon icon={Book02Icon} className="size-3" />
        )}
      </span>
    );
  }
  if (option.type === "resource") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center", className)}>
        {option.iconUrl ? (
          // A favicon is an inline data URI: nothing for next/image to optimize.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.iconUrl} alt="" aria-hidden className="size-4 rounded-[2px] object-contain" />
        ) : option.mime === "text/uri-list" ? (
          <HugeiconsIcon icon={Link02Icon} className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
        ) : (
          <ResourceTypeIcon mime={option.mime ?? "application/octet-stream"} name={option.label} className="size-4" />
        )}
      </span>
    );
  }
  if (option.type === "issue" && option.status) {
    return <StatusIndicator status={option.status} className={className} />;
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-blue-500/12 text-blue-600 dark:text-blue-400",
        className,
      )}
    >
      <span className="size-2 rounded-full bg-current" />
    </span>
  );
}

/**
 * A line from the list. `mousedown` and not `click`: the editing surface does not
 * must not lose focus, otherwise the blur closes the list before the click
 * arrives.
 */
export function MentionOptionRow({
  option,
  active,
  onPick,
  onHover,
}: {
  option: MentionOption;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      // A real movement only: arrows scroll the list under a still pointer,
      // and the synthetic events that follow must not move the selection.
      onMouseMove={(event) => {
        if (event.movementX !== 0 || event.movementY !== 0) onHover();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        active && "bg-muted",
      )}
    >
      <MentionFigure option={option} />
      <span className="min-w-0 truncate">
        {option.label}
        {option.detail && (
          <span className="ml-1.5 text-muted-foreground">{option.detail}</span>
        )}
      </span>
    </button>
  );
}

/** The list anchored ABOVE its composer (Numo's, pasted at the bottom of its
 panel). The description editor anchors his to the caret. */
export function MentionSuggestions({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
  style,
  semanticStatus = null,
}: {
  options: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
  className?: string;
  style?: React.CSSProperties;
  /** Where the search by meaning stands: a status row closes the list. */
  semanticStatus?: SemanticSearchStatus | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, options]);

  if (options.length === 0 && !semanticStatus) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      data-floating-surface
      style={style}
      className={cn(
        "scrollbar-quiet absolute bottom-full z-50 mb-1 max-h-56 w-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-md",
        className,
      )}
    >
      {options.map((option, index) => (
        <MentionRowWithDivider
          key={`${option.type}:${option.id}`}
          options={options}
          index={index}
        >
          <MentionOptionRow
            option={option}
            active={index === activeIndex}
            onPick={() => onPick(option)}
            onHover={() => onHover(index)}
          />
        </MentionRowWithDivider>
      ))}
      {semanticStatus && <SemanticSearchingHint status={semanticStatus} />}
    </div>
  );
}

/** A row, preceded by the "Related by meaning" divider when it is the first semantic one. */
export function MentionRowWithDivider({
  options,
  index,
  children,
}: {
  options: readonly { semantic?: boolean }[];
  index: number;
  children: React.ReactNode;
}) {
  // The divider holds the translation: menus without semantic rows (and
  // their tests) never need the intl context for it.
  const first = options[index]?.semantic && !options[index - 1]?.semantic;
  return (
    <>
      {first && <SemanticMentionDivider />}
      {children}
    </>
  );
}
