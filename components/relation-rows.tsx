"use client";

// One shape for a relation everywhere it is listed — the issue side panel,
// the objective panel and board popover, the card's relation popover: a group
// header per type, then rows on one grid. Every row starts with the other
// end's status, then an issue's identifier and title, or an objective's name
// in its color, then the "resolved" tag and the row action.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import { ObjectiveStatusIndicator, RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { OBJECTIVE_TEXT, objectiveTextStyle } from "@/components/objective-label";
import type { RelationMenuKind } from "@/lib/issue-hierarchy";
import type { IssueStatus } from "@/lib/issue-constants";
import type { Objective } from "@/lib/types";

/** The tint a relation type carries: blocking reads red, blocking others amber. */
export function relationToneClass(type: RelationMenuKind): string {
  return type === "blocked_by"
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : type === "blocks"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "text-muted-foreground";
}

/** A type's header: its icon and name in the type's tint, then the count. */
export function RelationGroupHeader({ type, count, className }: {
  type: RelationMenuKind;
  count: number;
  className?: string;
}) {
  const t = useTranslations("Relations");
  return (
    <div className={cn("mb-1 flex h-6 items-center gap-2 px-1.5 text-xs", className)}>
      <span className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-medium", relationToneClass(type),
        type !== "blocked_by" && type !== "blocks" && "bg-muted")}>
        <RelationIcon relation={type} className="size-3" />
        {t(type)}
      </span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

/** The other end of a relation, as a row shows it. */
export type RelationRowTarget =
  | { kind: "issue"; status?: IssueStatus; identifier: string | null; title: string }
  | { kind: "objective"; objective?: Objective; name: string };

export function RelationRow({ target, via, resolved, onOpen, action }: {
  target: RelationRowTarget;
  /** The objective passing a blocker on, named under the title. */
  via?: string | null;
  resolved?: boolean;
  onOpen?: () => void;
  /** The trailing control: removal, or the inherited objective's link. */
  action?: ReactNode;
}) {
  const t = useTranslations("Relations");
  const done = target.kind === "issue"
    ? target.status === "done"
    : target.objective?.status === "done";
  const title = target.kind === "issue" ? target.title || target.identifier || "" : target.name;
  return (
    <div className="group/relrow flex min-h-8 items-center gap-1 rounded-md hover:bg-muted/60">
      <button
        type="button"
        disabled={!onOpen}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {target.kind === "issue"
            ? target.status && <StatusIndicator status={target.status} className="size-4" />
            : target.objective && <ObjectiveStatusIndicator status={target.objective.status} className="size-4" />}
        </span>
        {target.kind === "issue" ? (
          target.identifier && (
            <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
              {target.identifier}
            </span>
          )
        ) : (
          <span className="sr-only">{t("objectives")}: </span>
        )}
        <span
          className="min-w-0 flex-1"
          style={target.kind === "objective" ? objectiveTextStyle(target.objective?.color) : undefined}
        >
          <TruncatedText
            text={title}
            className={cn(
              "block truncate text-sm",
              // An objective reads by its name in its color (MIN-785).
              target.kind === "objective" && OBJECTIVE_TEXT,
              done && "text-muted-foreground line-through",
            )}
          />
          {via && (
            <span className="block truncate text-xs text-muted-foreground">
              {t("viaObjective", { name: via })}
            </span>
          )}
        </span>
        {resolved && (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t("resolved")}
          </span>
        )}
      </button>
      {action}
    </div>
  );
}

/** The row's remove control: shown on hover, always on touch screens. */
export function RelationRemoveButton({ onClick }: { onClick: () => void }) {
  const tCommon = useTranslations("Common");
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={tCommon("remove")}
      className="mr-1 size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relrow:opacity-100 focus-visible:opacity-100 touch:opacity-100"
      onClick={onClick}
    >
      <HugeiconsIcon icon={Cancel01Icon} />
    </Button>
  );
}
