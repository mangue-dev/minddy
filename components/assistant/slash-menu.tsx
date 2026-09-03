"use client";

// The “/” command menu of the Numo composer — the twin brother of the
// list of mentions (mention-suggest), for Skills: type “/” at the beginning
// message opens the list, choosing places the command in pill in the text.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Layers, SquarePen, type LucideIcon } from "lucide-react";
import { cn } from "mangue-ui";
import type { AssistantCommandId } from "@/lib/assistant-types";
import type { RepositorySkillSummary } from "@/lib/repository-skills";

export { filterSlashOptions } from "@/lib/assistant-slash-options";

export interface SlashCommandOption {
  kind: "command";
  id: AssistantCommandId;
  /** What is written after the “/” — localized (“create issue” / “create ticket”). */
  label: string;
  /** What the command does, in one line, below the label. */
  description: string;
  icon: LucideIcon;
  /** Search terms in addition to the label (the alias of the other language). */
  keywords?: string[];
}

export interface SlashSkillOption {
  kind: "skill";
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  skill: RepositorySkillSummary;
}

export type SlashMenuOption = SlashCommandOption | SlashSkillOption;

/**
 * The “/” commands offered by Numo composers (MIN-159) — ids
 * canonical, localized labels. A single table for all surfaces that
 * speak to him (the panel, the reception): a command added here opens
 * two sides, and its wording cannot diverge from one to the other.
 *
 * The keywords carry both languages: “/create” finds the same command
 * when the interface is in French, and vice versa.
 */
export function useSlashCommands(): SlashCommandOption[] {
  const t = useTranslations("Assistant");
  return useMemo(
    () => [
      {
        kind: "command" as const,
        id: "create-issue",
        label: t("slashCreateIssueLabel"),
        description: t("slashCreateIssueDescription"),
        icon: SquarePen,
        keywords: ["create issue", "créer ticket"],
      },
    ],
    [t],
  );
}

export function repositorySkillOptions(
  skills: readonly RepositorySkillSummary[],
): SlashSkillOption[] {
  return skills.map((skill) => ({
    kind: "skill",
    id: skill.path,
    label: skill.name,
    description: skill.description,
    icon: Layers,
    skill,
  }));
}

/** Commands or skills that match the query typed after the active trigger. */
export function SlashMenu({
  options,
  prefix = "/",
  activeIndex,
  onPick,
  onHover,
  className,
}: {
  options: SlashMenuOption[];
  prefix?: "/" | "$";
  activeIndex: number;
  onPick: (option: SlashMenuOption) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full z-50 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md",
        className,
      )}
    >
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          // mousedown, not click: the composer must not lose focus (the
          // blur would close the list before the click arrives).
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
            index === activeIndex && "bg-muted",
          )}
        >
          <option.icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate">{prefix}{option.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
