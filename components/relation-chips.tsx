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
import { RelationIcon } from "@/components/issue-indicators";
import { RelationGroupHeader, RelationRemoveButton, RelationRow, relationToneClass } from "@/components/relation-rows";
import { toast } from "sonner";
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
                      relationToneClass(type),
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
              <RelationGroupHeader type={type} count={items.length} />
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
                    <RelationRow
                      key={r.id}
                      target={isObjective
                        ? { kind: "objective", objective: r.otherObjective, name }
                        : { kind: "issue", status: r.otherStatus, identifier, title: r.otherName ?? "" }}
                      via={r.inheritedObjectiveName}
                      onOpen={open ? () => {
                        setExpanded(null);
                        open(r.otherId);
                      } : undefined}
                      action={removable ? (
                        <RelationRemoveButton
                          onClick={() => {
                            setExpanded(null);
                            setRemoveTarget({ id: r.id, name: [identifier, isObjective ? name : r.otherName].filter(Boolean).join(" ") });
                          }}
                        />
                      ) : null}
                    />
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
