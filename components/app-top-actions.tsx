"use client";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { cn } from "mangue-ui";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { KbdSequence } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COMPACT_CONTROL_CLASS, SIDEBAR_TOOLTIP_DELAY_MS } from "@/lib/sidebar-control-styles";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import { CHORD_PREFIX } from "@/lib/keyboard/keyboard-context";
import type { AppNavItem } from "@/components/app-sidebar";

function SidebarTopAction({
  icon: Icon,
  label,
  href,
  onClick,
  onWarm,
  badge,
  shortcut,
  inboxTrigger,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
  onWarm?: () => void;
  badge?: ReactNode;
  shortcut?: ReactNode;
  inboxTrigger?: boolean;
}) {
  const className = cn(
    SIDEBAR_COMPACT_CONTROL_CLASS,
    "text-sidebar-foreground/65 hover:text-sidebar-foreground",
  );
  const content = (
    <span className="relative flex size-[18px] shrink-0">
      <Icon className="size-[18px]" />
      {badge != null ? (
        <span className="absolute -right-2 -top-1.5 flex items-center justify-center rounded-full bg-sidebar">
          {badge}
        </span>
      ) : null}
    </span>
  );
  const control = href ? (
    <Link href={href} aria-label={label} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={label}
      className={className}
      onClick={onClick}
      data-inbox-trigger={inboxTrigger || undefined}
      aria-haspopup={inboxTrigger ? "dialog" : undefined}
      onPointerEnter={onWarm}
      onFocus={onWarm}
    >
      {content}
    </button>
  );

  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
    >
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppTopActions({
  collapsed,
  inbox,
  onSearch,
  onSearchWarm,
}: {
  collapsed: boolean;
  inbox: AppNavItem;
  onSearch: () => void;
  onSearchWarm?: () => void;
}) {
  const t = useTranslations("Nav");
  const tk = useTranslations("Keyboard");
  const modKey = useModKey();
  if (collapsed) return null;

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <SidebarTopAction
        icon={Search}
        label={t("searchPlaceholder")}
        onClick={onSearch}
        onWarm={onSearchWarm}
        shortcut={<KbdSequence keys={[[modKey, "K"]]} size="sm" />}
      />
      <SidebarTopAction
        icon={inbox.icon!}
        label={inbox.label}
        onClick={inbox.onClick}
        inboxTrigger
        badge={inbox.badgeCollapsed ?? inbox.badge}
        shortcut={
          inbox.shortcut ? (
            <KbdSequence
              keys={[[CHORD_PREFIX.toUpperCase()], [inbox.shortcut]]}
              separator={tk("then")}
              size="sm"
            />
          ) : null
        }
      />
    </div>
  );
}
