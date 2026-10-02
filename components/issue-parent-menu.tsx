"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons";
import {
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "mangue-ui";

export function IssueParentMenu({
  parentIdentifier,
  onOpenParent,
  onUnlink,
}: {
  parentIdentifier: string | null;
  onOpenParent: () => void;
  onUnlink: () => Promise<boolean>;
}) {
  const t = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const [confirmParent, setConfirmParent] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // Keep the dialog mounted while the optimistic update removes the parent.
  useEffect(() => {
    if (!unlinking && confirmParent !== parentIdentifier) setConfirmParent(null);
  }, [confirmParent, parentIdentifier, unlinking]);

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      if (await onUnlink()) {
        setConfirmParent(null);
        toast.success(t("parentUnlinkedToast"));
      }
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <>
      {parentIdentifier && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("subIssueOf", { id: parentIdentifier })}
                className="inline-flex min-w-0 items-center rounded-md px-1 py-0.5 text-lg font-semibold tracking-tight text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{parentIdentifier}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={onOpenParent}>
                <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden />
                {t("openParent")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmParent(parentIdentifier)}>
                <HugeiconsIcon icon={Unlink01Icon} aria-hidden />
                {t("unlinkFromParent", { id: parentIdentifier })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </>
      )}

      <ConfirmDeleteDialog
        open={confirmParent !== null}
        onOpenChange={(next) => !next && setConfirmParent(null)}
        title={t("unlinkParentDialogTitle", { id: confirmParent ?? "" })}
        description={t("unlinkParentDialogDescription", { id: confirmParent ?? "" })}
        confirmLabel={t("unlinkParentConfirm")}
        cancelLabel={tCommon("cancel")}
        closeOnConfirm={false}
        isLoading={unlinking}
        onConfirm={handleUnlink}
      />
    </>
  );
}
