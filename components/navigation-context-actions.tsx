"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { toast } from "mangue-ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import type { ContextMenuAction } from "@/components/issue-context-menu";

export function useNavigationContextActions(href: string | null | undefined): ContextMenuAction[] {
  const session = useOptionalAppTabSession();
  const t = useTranslations("CommandPaletteActions");
  return useMemo(() => {
    const destination = normalizeAppTabLocation(href);
    if (!destination || !session) return [];
    return [
      {
        // Always carried: `IssueContextMenu` only renders a separator from the
        // second entry, so a menu made of these alone shows no orphan bar.
        id: "navigation-open-new-tab",
        label: t("openInNewTab"),
        icon: <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />,
        separatorBefore: true,
        onSelect: () => { void session.create(destination); },
      },
      {
        id: "navigation-copy-link",
        label: t("copyLink"),
        icon: <HugeiconsIcon icon={Link02Icon} className="size-4" />,
        onSelect: () => {
          void navigator.clipboard.writeText(new URL(destination, window.location.origin).href)
            .then(() => toast.success(t("linkCopied")));
        },
      },
    ];
  }, [href, session, t]);
}
