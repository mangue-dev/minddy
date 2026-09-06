"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_TOOLTIP_DELAY_MS } from "@/lib/sidebar-control-styles";
import { useSidebarVisibility } from "@/lib/sidebar-visibility-context";

export function SidebarVisibilityButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("Nav");
  const { hidden, toggle } = useSidebarVisibility();
  const label = t(hidden ? "showSidebar" : "hideSidebar");
  const Icon = hidden ? PanelLeftOpen : PanelLeftClose;
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={toggle}
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-lg pl-[9px] text-sm text-sidebar-foreground/65 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "w-9" : "w-full pr-2",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip delayDuration={SIDEBAR_TOOLTIP_DELAY_MS} disableHoverableContent>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
