"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "mangue-ui";

/**
 * What we ask when a creation dialog closes on an entry
 * (MIN-41). Three exits, because there are three intentions and none should
 * cost two actions: return to editing, save for later, or
 * give up. Without “Abandoning”, renouncing meant saving a
 * draft then go and delete it in the restart row — the output
 * The simpler was the longer.
 *
 * `onDiscard` closes WITHOUT keeping, and throws away the original draft if the
 * form came from it: otherwise we would find, in recent drafts,
 * the one we thought we had abandoned.
 *
 * Same design and same vocabulary as `CloseProjectDraftDialog`: it’s the same
 * question, it arises in the same way.
 */
export function CloseDraftDialog({
  open,
  onOpenChange,
  onConfirm,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("Drafts");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("closeTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("closeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Three buttons in a modal calibrated for two (`max-w-sm`): they
 fit because the labels are short, and `flex-wrap` is the
 belt — a translation that gets longer goes to the line IN the
 box instead of overflowing it.
 The order of the DOM is that of the moving stack read from bottom to top
 (`flex-col-reverse`); online, “Abandon” goes back to the left to leave the pair you really choose on the right. */}
        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
          {/* `variant`, not a colored `className`: AlertDialogAction
 places the button classes on a parent Slot, so a color
 written here would not pass through tailwind-merge and would lose against
 that of the variant. */}
          <AlertDialogAction
            variant="destructive"
            onClick={onDiscard}
            className="sm:order-first sm:mr-auto"
          >
            {t("closeDiscard")}
          </AlertDialogAction>
          <AlertDialogAction onClick={onConfirm}>
            {t("closeConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
