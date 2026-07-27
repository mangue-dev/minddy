"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Command as CommandIcon, X } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import {
  useBulkActions,
  type BulkCycleActions,
} from "@/lib/bulk-actions-context";
import type { IssueUpdateInput, Member, Objective } from "@/lib/types";

/**
 * Linear-style floating selection pill (MIN-75). It no longer carries its own
 * cmdk dropdown: "Actions" hands the selection to the global command palette
 * (⌘K) via {@link useBulkActions}, so bulk edits reuse the palette's inline
 * submenu forms (one "Changer le statut" that opens a select, etc.). The pill
 * keeps only the fast paths: the count, Actions, an icon-only "Ask Numo", and
 * clear.
 */
export function BulkIssueActions({
  count,
  members,
  onUpdate,
  onDelete,
  onClear,
  onAskNumo,
  cycle,
  objectives,
  onLink,
}: {
  count: number;
  members: Member[];
  onUpdate: (patch: IssueUpdateInput) => void;
  onDelete?: () => void;
  onClear: () => void;
  onAskNumo: () => void;
  cycle?: BulkCycleActions;
  objectives?: Objective[];
  onLink?: () => void;
}) {
  const t = useTranslations("BulkActions");
  const { requestBulkActions } = useBulkActions();

  // Cross-project boards flatten every project's members, so the same person can
  // appear once per shared project — de-dupe by user id (also fixes the React
  // duplicate-key warning the assignee list used to throw).
  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter((m) => {
      if (seen.has(m.user_id)) return false;
      seen.add(m.user_id);
      return true;
    });
  }, [members]);

  const openActions = () =>
    requestBulkActions({
      count,
      members: uniqueMembers,
      onUpdate,
      onDelete,
      onAskNumo,
      cycle,
      objectives,
      onLink,
    });

  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 p-1.5 shadow-xl backdrop-blur-md">
      <span className="px-3 text-sm font-medium whitespace-nowrap">
        {t("selected", { count })}
      </span>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5 rounded-full px-3 text-xs"
        onClick={openActions}
      >
        <CommandIcon className="size-3.5" />
        {t("actions")}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            onClick={onAskNumo}
            aria-label={t("askNumo")}
          >
            <NumoIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("askNumo")}</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        onClick={onClear}
        aria-label={t("clear")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
