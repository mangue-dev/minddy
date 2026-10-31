"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SelectionPill } from "@/components/bulk-issue-actions";
import { useBulkActions, type EntityBulkAction } from "@/lib/bulk-actions-context";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";

/**
 * The selection pill of a list surface other than an issue board (MIN-873):
 * feedback posts, routines, objectives, wiki pages. "Actions" hands the
 * surface's rows to ⌘K; moving to the trash always asks first, through the
 * dialog this pill owns. Render it inside `BulkIssueActionsPresence`.
 */
export function BulkEntityActions({
  label,
  placeholder,
  count,
  surface,
  actions,
  trash,
  onAskNumo,
  onClear,
}: {
  /** "3 feedback posts selected". */
  label: string;
  /** The palette's search placeholder: "Actions for 3 feedback posts…". */
  placeholder: string;
  count: number;
  /** For analytics: "feedback", "routines", "objectives", "pages". */
  surface: string;
  actions: EntityBulkAction[];
  /** The trash row and its confirmation; absent when nothing can be trashed. */
  trash?: {
    /** "Move 3 feedback posts to the trash?" */
    title: string;
    onConfirm: () => void | Promise<void>;
  };
  onAskNumo: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("BulkActions");
  const tCommon = useTranslations("Common");
  const { requestBulkActions } = useBulkActions();
  const [confirmTrashOpen, setConfirmTrashOpen] = useState(false);

  const openActions = () =>
    requestBulkActions({
      kind: "entities",
      count,
      label,
      placeholder,
      surface,
      onAskNumo,
      actions: trash
        ? [
            ...actions,
            {
              id: "trash",
              title: tCommon("moveToTrash"),
              icon: Delete02Icon,
              keywords: ["trash", "delete", "remove", "corbeille", "supprimer"],
              // Opens the confirmation; nothing is trashed yet.
              run: () => setConfirmTrashOpen(true),
            },
          ]
        : actions,
    });

  return (
    <SelectionPill label={label} onActions={openActions} onAskNumo={onAskNumo} onClear={onClear}>
      {trash && (
        <ConfirmDeleteDialog
          open={confirmTrashOpen}
          onOpenChange={setConfirmTrashOpen}
          title={trash.title}
          description={t("trashConfirmDescription", { days: TRASH_RETENTION_DAYS })}
          confirmLabel={tCommon("moveToTrash")}
          cancelLabel={tCommon("cancel")}
          onConfirm={trash.onConfirm}
        />
      )}
    </SelectionPill>
  );
}
