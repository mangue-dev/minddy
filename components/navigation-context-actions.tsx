"use client";

import { ExternalLink, Link2 } from "lucide-react";
import { toast } from "mangue-ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { normalizeAppTabLocation } from "@/lib/app-tab-location";
import { useOptionalAppTabs } from "@/lib/app-tabs-context";
import type { ContextMenuAction } from "@/components/issue-context-menu";

export function useNavigationContextActions(href: string | null | undefined): ContextMenuAction[] {
  const session = useOptionalAppTabs()?.session;
  const t = useTranslations("CommandPaletteActions");
  return useMemo(() => {
    const destination = normalizeAppTabLocation(href);
    if (!destination || !session) return [];
    return [
      {
        id: "navigation-open-new-tab",
        label: t("openInNewTab"),
        icon: <ExternalLink className="size-4" />,
        onSelect: () => { void session.create(destination); },
      },
      {
        id: "navigation-copy-link",
        label: t("copyLink"),
        icon: <Link2 className="size-4" />,
        onSelect: () => {
          void navigator.clipboard.writeText(new URL(destination, window.location.origin).href)
            .then(() => toast.success(t("linkCopied")));
        },
      },
    ];
  }, [href, session, t]);
}
