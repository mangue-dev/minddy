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
import { Book02Icon, Layers01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import {
  CYCLE_ICON,
  DATE_ICON,
  MCP_ICON,
  PULL_REQUEST_ICON,
  ROUTINE_ICON,
  SCRATCHPAD_ICON,
} from "@/components/feature-icons";
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
import { MENU_ROW_ACTIVE_CLASS, MENU_ROW_CLASS } from "@/components/ui/menu-surface";
import { groupBySection, mentionSection, type MentionSectionId } from "@/lib/suggestion-menu";
import { SuggestionMenu } from "@/components/editor/suggestion-menu";
import type { IssueStatus } from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import type { MentionMeta } from "@/lib/mention-link";

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
    | "resource"
    // MIN-872.
    | "pull_request"
    | "routine"
    | "scratchpad"
    | "cycle"
    | "skill"
    | "mcp"
    | "date";
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
  /** What the mention stores besides its id: a date's time, a skill's project. */
  meta?: MentionMeta;
  /** `@date`: the inserted date pill opens its picker at once. */
  openPicker?: boolean;
}

/** The options in the order their menu lists them: by section (people,
    projects, issues, objectives, pages, resources, then issues related by
    meaning), each section where its first option stands. */
export function sectionedMentions(options: readonly MentionOption[]) {
  return groupBySection(options, mentionSection);
}

/** The header of a mention section, translated. */
export function useMentionSectionLabel(): (id: string) => string | null {
  const t = useTranslations("Picker");
  return (id) => {
    switch (id as MentionSectionId) {
      case "people":
        return t("mentionSectionPeople");
      case "projects":
        return t("mentionSectionProjects");
      case "issues":
        return t("mentionSectionIssues");
      case "objectives":
        return t("mentionSectionObjectives");
      case "pages":
        return t("mentionSectionPages");
      case "resources":
        return t("mentionSectionResources");
      case "dates":
        return t("mentionSectionDates");
      case "pullRequests":
        return t("mentionSectionPullRequests");
      case "routines":
        return t("mentionSectionRoutines");
      case "skills":
        return t("mentionSectionSkills");
      case "mcp":
        return t("mentionSectionMcp");
      case "planning":
        return t("mentionSectionPlanning");
      case "semantic":
        return t("relatedByMeaning");
      default:
        return null;
    }
  };
}

/** The options that match the query typed after the “@”. */
export function filterMentions(
  options: MentionOption[],
  query: string,
): MentionOption[] {
  return filterMentionItems(options, query);
}

/** The glyph of a feature target, the one its pill and sidebar entry show. */
const OPTION_GLYPHS = {
  pull_request: PULL_REQUEST_ICON,
  routine: ROUTINE_ICON,
  scratchpad: SCRATCHPAD_ICON,
  cycle: CYCLE_ICON,
  skill: Layers01Icon,
  mcp: MCP_ICON,
  date: DATE_ICON,
} as const;

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
  const glyph = OPTION_GLYPHS[option.type as keyof typeof OPTION_GLYPHS];
  if (glyph) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center text-muted-foreground", className)}>
        <HugeiconsIcon icon={glyph} className="size-4" aria-hidden />
      </span>
    );
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
        MENU_ROW_CLASS,
        "text-foreground",
        active && MENU_ROW_ACTIVE_CLASS,
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
 panel). The description editor anchors his to the caret. `options` must be
 in their sectioned order (`sectionedMentions`): `activeIndex` walks it, and
 `activeIndex === options.length` is the “Close menu” row. */
export function MentionSuggestions({
  options,
  activeIndex,
  onPick,
  onHover,
  onClose,
  className,
  style,
  semanticStatus = null,
}: {
  options: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
  /** “Close menu”: closes the list and leaves the typed text as text. */
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** Where the search by meaning stands: a status row closes the list. */
  semanticStatus?: SemanticSearchStatus | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const sectionLabel = useMentionSectionLabel();
  const { sections } = sectionedMentions(options);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (activeIndex === 0) {
      list.scrollTop = 0;
      return;
    }
    list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, options]);

  return (
    <div style={style} className={cn("absolute bottom-full z-50 mb-1 w-64", className)}>
      <SuggestionMenu
        sections={sections}
        sectionLabel={sectionLabel}
        listRef={listRef}
        listClassName="max-h-56"
        closeActive={activeIndex === options.length}
        onClose={onClose}
        onCloseHover={() => onHover(options.length)}
        trailing={semanticStatus && <SemanticSearchingHint status={semanticStatus} />}
        renderItem={(option, index) => (
          <MentionOptionRow
            key={`${option.type}:${option.id}:${option.meta ? JSON.stringify(option.meta) : ""}`}
            option={option}
            active={index === activeIndex}
            onPick={() => onPick(option)}
            onHover={() => onHover(index)}
          />
        )}
      />
    </div>
  );
}
