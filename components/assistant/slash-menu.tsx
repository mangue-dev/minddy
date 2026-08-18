"use client";

// The “/” command menu of the Numo composer — the twin brother of the
// list of mentions (mention-suggest), for Skills: type “/” at the beginning
// message opens the list, choosing places the command in pill in the text.

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SquarePen, type LucideIcon } from "lucide-react";
import { cn } from "mangue-ui";
import type { AssistantCommandId } from "@/lib/assistant-types";

export interface SlashCommandOption {
  id: AssistantCommandId;
  /** What is written after the “/” — localized (“create issue” / “create ticket”). */
  label: string;
  /** What the command does, in one line, below the label. */
  description: string;
  icon: LucideIcon;
  /** Search terms in addition to the label (the alias of the other language). */
  keywords?: string[];
}

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

/** Commands that match the query typed after the “/”. */
export function filterCommands(
  options: SlashCommandOption[],
  query: string,
): SlashCommandOption[] {
  const q = query.trim().toLowerCase();
  return options.filter((o) =>
    q
      ? [o.label, ...(o.keywords ?? [])].some((term) =>
          term.toLowerCase().includes(q),
        )
      : true,
  );
}

export function SlashMenu({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
}: {
  options: SlashCommandOption[];
  activeIndex: number;
  onPick: (option: SlashCommandOption) => void;
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
            <span className="block truncate">/{option.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
