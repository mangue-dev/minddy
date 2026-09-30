"use client";

import { useTranslations } from "next-intl";
import { ConfirmDeleteDialog } from "mangue-ui";

export function CustomDomainRemovalDialog({ open, onOpenChange, onConfirm, kind }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  kind: "board" | "share" | "page";
}) {
  const t = useTranslations("CustomDomain");
  const common = useTranslations("Common");
  return <ConfirmDeleteDialog
    open={open}
    onOpenChange={onOpenChange}
    title={t(kind === "board" ? "disableBoardTitle" : kind === "page" ? "unpublishPageTitle" : "stopSharingTitle")}
    description={t("stopHostingDescription")}
    confirmLabel={t(kind === "board" ? "disableBoard" : kind === "page" ? "unpublishPage" : "stopSharing")}
    cancelLabel={common("cancel")}
    onConfirm={onConfirm}
  />;
}
