"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  RELATION_PRIORITY,
  type DisplayRelation,
} from "@/lib/relation-constants";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { ObjectiveBadge } from "@/components/objective-label";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export type ChipRelation = DisplayRelation;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Group dependencies by direction so identifiers never compete with them for space. */
export function RelationChips({
  relations,
  projectKey,
  onOpen,
  onOpenObjective,
  onRemove,
  className,
}: {
  relations: ChipRelation[];
  projectKey: string;
  onOpen?: (issueId: string) => void;
  onOpenObjective?: (objectiveId: string) => void;
  /** Removes a relation, after the same confirmation as the issue sidebar. */
  onRemove?: (relationId: string) => void | Promise<void>;
  className?: string;
}) {
  const t = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<{ id: string; name: string } | null>(null);
  const active = relations.filter((r) => !r.resolved);
  if (!active.length) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        className,
      )}
      onClick={stop}
      onPointerDown={stop}
    >
      {RELATION_PRIORITY.map((type) => {
        const items = active.filter((r) => r.relation === type);
        if (!items.length) return null;
        const targets = items.slice(0, 3).map((r) =>
          r.otherType === "objective"
            ? r.otherName ?? t("objectives")
            : issueIdentifier(projectKey, r.otherNumber ?? 0),
        ).join(", ");
        const label = `${t(type)} ${targets}${items.length > 3 ? ` +${items.length - 3}` : ""}`;
        return (
          <Popover
            key={type}
            open={expanded === type}
            onOpenChange={(open) => setExpanded(open ? type : null)}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      type === "blocked_by"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400"
                        : type === "blocks"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                    )}
                  >
                    <RelationIcon relation={type} className="size-3" />
                    <span>{items.length}</span>
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
            <PopoverContent
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)] p-2"
              onClick={stop}
              onPointerDown={stop}
            >
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t(type)}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {items.map((r) => {
                  const isObjective = r.otherType === "objective";
                  const identifier = isObjective
                    ? null
                    : issueIdentifier(projectKey, r.otherNumber ?? 0);
                  const name = r.otherName ?? identifier ?? t("objectives");
                  const open = isObjective ? onOpenObjective : onOpen;
                  // A relation inherited through an objective is removed on
                  // the objective, as in the sidebar.
                  const removable = !!onRemove && !r.inheritedObjectiveName;
                  return (
                    <div key={r.id} className="group/relrow flex min-w-0 items-start gap-1 rounded-md hover:bg-muted">
                    <button
                      type="button"
                      disabled={!open}
                      onClick={() => {
                        setExpanded(null);
                        open?.(r.otherId);
                      }}
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100"
                    >
                      {r.otherStatus && (
                        <StatusIndicator
                          status={r.otherStatus}
                          className="mt-0.5 size-4 shrink-0"
                        />
                      )}
                      {identifier && (
                        <span className="shrink-0 whitespace-nowrap font-mono text-xs leading-5 text-muted-foreground">
                          {identifier}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        {r.otherObjective ? (
                          <span className="flex min-w-0">
                            <ObjectiveBadge objective={r.otherObjective} tooltip={name} />
                          </span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "block truncate",
                                  r.otherStatus === "done" &&
                                    "text-muted-foreground line-through",
                                )}
                              >
                                {name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{name}</TooltipContent>
                          </Tooltip>
                        )}
                        {r.inheritedObjectiveName && (
                          <span className="block whitespace-normal text-xs leading-relaxed text-muted-foreground">
                            {t("viaObjective", {
                              name: r.inheritedObjectiveName,
                            })}
                          </span>
                        )}
                      </span>
                    </button>
                    {removable ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tCommon("remove")}
                        className="mt-1 mr-1 size-6 shrink-0 bg-transparent text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relrow:opacity-100 focus-visible:opacity-100 touch:opacity-100"
                        onClick={() => {
                          setExpanded(null);
                          setRemoveTarget({ id: r.id, name: [identifier, isObjective ? name : r.otherName].filter(Boolean).join(" ") });
                        }}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} />
                      </Button>
                    ) : null}
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
      {onRemove ? (
        <ConfirmDeleteDialog
          open={removeTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          title={t("removeTitle", { name: removeTarget?.name ?? "" })}
          description={t("removeDescription")}
          confirmLabel={tCommon("remove")}
          cancelLabel={tCommon("cancel")}
          onConfirm={() => {
            if (!removeTarget) return;
            void Promise.resolve(onRemove(removeTarget.id)).catch(
              (err) => toast.error((err as Error).message),
            );
          }}
        />
      ) : null}
    </span>
  );
}
