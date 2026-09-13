"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, cn } from "mangue-ui";
import { ArrowDownToLine, ShoppingBag, RefreshCw, Loader2, type LucideIcon } from "lucide-react";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { useDesktopUpdateStatus } from "@/lib/desktop/use-update-status";
import { useWindowsStoreUpdateAvailable } from "@/lib/desktop/use-windows-store-update";
import { useNewVersion } from "@/lib/use-new-version";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_TOOLTIP_DELAY_MS } from "@/lib/sidebar-control-styles";

function FooterRow({
  icon: Icon,
  label,
  expandedLabel = label,
  onClick,
  collapsed,
  active = false,
  disabled = false,
  iconClassName,
  iconCollapsedOnly = false,
  centerLabel = false,
  trailingIcon: TrailingIcon,
  ariaControls,
  ariaExpanded,
  className,
}: {
  icon: LucideIcon;
  label: string;
  expandedLabel?: string;
  onClick: () => void;
  collapsed: boolean;
  active?: boolean;
  /** Keep progress rows focusable for their tooltip while disabling activation. */
  disabled?: boolean;
  iconClassName?: string;
  iconCollapsedOnly?: boolean;
  centerLabel?: boolean;
  trailingIcon?: LucideIcon;
  ariaControls?: string;
  ariaExpanded?: boolean;
  className?: string;
}) {
  const btn = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaControls ? "dialog" : undefined}
      className={cn(
        "relative flex h-9 items-center rounded-lg text-sm font-medium transition-colors",
        disabled
          ? "cursor-default"
          : "cursor-pointer hover:bg-sidebar-accent hover:text-foreground",
        active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
        "pl-[9px]",
        collapsed ? cn("w-9", "pr-[9px]") : "w-full gap-3 pr-3 text-left",
        centerLabel && !collapsed && "px-[9px]",
        className,
      )}
    >
      {collapsed || !iconCollapsedOnly ? (
        <Icon className={cn(
          "size-[18px] shrink-0",
          centerLabel && !collapsed && "absolute left-[9px]",
          iconClassName,
        )} />
      ) : null}
      {/* Keep long translated labels on one line in the reserved update slot. */}
      {!collapsed && (
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            centerLabel && "px-6 text-center",
          )}
        >
          {expandedLabel}
        </span>
      )}
      {!collapsed && TrailingIcon && <TrailingIcon className="size-4 shrink-0" />}
    </button>
  );
  // Keep the trigger mounted when switching presentation so focus is retained.
  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      disableHoverableContent
      open={collapsed ? undefined : false}
    >
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Persistent update entry for the desktop shell, Microsoft Store package, and
 * deployed web app. A desktop update takes priority because updating the shell
 * also reloads the current web app.
 */
export function AppUpdateAction({
  collapsed,
  onOpenChange,
}: {
  collapsed: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const tNav = useTranslations("Nav");
  const tWebUpdate = useTranslations("NewVersion");
  const tCommon = useTranslations("Common");
  const confirmationId = useId();
  const confirmationTitleId = `${confirmationId}-title`;
  const confirmationDescriptionId = `${confirmationId}-description`;
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const desktopStatus = useDesktopUpdateStatus();
  const windowsStoreUpdateAvailable = useWindowsStoreUpdateAvailable();
  const webUpdate = useNewVersion();
  const hasDirectDesktopUpdate = desktopStatus.state !== "idle";
  const isStoreUpdate =
    !hasDirectDesktopUpdate && windowsStoreUpdateAvailable;
  const isWebUpdate = !hasDirectDesktopUpdate && !isStoreUpdate;
  if (isWebUpdate && !webUpdate.visible) return null;

  const ready =
    isWebUpdate || isStoreUpdate || desktopStatus.state === "ready";
  const pending = isWebUpdate && webUpdate.refreshing;
  const label =
    desktopStatus.state !== "idle"
      ? tNav(
          desktopStatus.state === "ready"
            ? "updateReady"
            : "updateDownloading",
          { version: desktopStatus.version },
        )
      : isStoreUpdate
        ? tNav("windowsStoreUpdateReady")
        : tWebUpdate("title");
  const actionLabel = isWebUpdate
    ? tWebUpdate("refresh")
    : isStoreUpdate
      ? tNav("windowsStoreUpdateAction")
      : tNav("updateAction");
  const confirmationTitle = isWebUpdate
    ? tWebUpdate("confirmTitle")
    : tNav("updateConfirmTitle");
  const confirmationDescription = isWebUpdate
    ? tWebUpdate("confirmDescription")
    : tNav("updateConfirmDescription");
  const handleConfirmationOpenChange = (open: boolean) => {
    setConfirmationOpen(open);
    onOpenChange?.(open);
  };
  const applyUpdate = () => {
    handleConfirmationOpenChange(false);
    if (isWebUpdate) {
      webUpdate.refresh();
      return;
    }
    if (isStoreUpdate) {
      getDesktopBridge()?.openWindowsStoreUpdate?.();
      return;
    }
    getDesktopBridge()?.installUpdate();
  };
  const confirmation = (
    <PopoverContent
      id={confirmationId}
      role="dialog"
      aria-labelledby={confirmationTitleId}
      aria-describedby={confirmationDescriptionId}
      side="bottom"
      align="end"
      sideOffset={8}
      collisionPadding={10}
      className="w-72 gap-3 rounded-xl p-3"
    >
      <PopoverHeader>
        <PopoverTitle id={confirmationTitleId}>
          {confirmationTitle}
        </PopoverTitle>
        <PopoverDescription id={confirmationDescriptionId}>
          {confirmationDescription}
        </PopoverDescription>
      </PopoverHeader>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleConfirmationOpenChange(false)}
        >
          {tCommon("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          className="bg-[#0085FF] text-white hover:bg-[#0085FF]/90"
          onClick={applyUpdate}
        >
          {pending && <Loader2 className="animate-spin" />}
          {actionLabel}
        </Button>
      </div>
    </PopoverContent>
  );

  const row = (
    <FooterRow
      icon={
        isWebUpdate
          ? RefreshCw
          : isStoreUpdate
            ? ShoppingBag
            : ready
              ? ArrowDownToLine
              : Loader2
      }
      iconClassName={!ready || pending ? "animate-spin" : undefined}
      iconCollapsedOnly={ready && !pending}
      centerLabel={ready}
      className={
        ready
          ? cn(
              "my-px h-[34px] bg-[#0085FF] text-white hover:bg-[#0085FF]/90 hover:text-white",
              collapsed && "mx-px w-[34px] px-2",
            )
          : undefined
      }
      label={label}
      expandedLabel={ready ? actionLabel : label}
      collapsed={collapsed}
      disabled={!ready || pending}
      ariaControls={
        ready && !pending && !isStoreUpdate ? confirmationId : undefined
      }
      ariaExpanded={
        ready && !pending && !isStoreUpdate ? confirmationOpen : undefined
      }
      onClick={
        isStoreUpdate
          ? applyUpdate
          : () => handleConfirmationOpenChange(true)
      }
    />
  );

  // The compact variant shows its icon; the full variant uses the action label.
  if (isStoreUpdate) return row;
  return (
    <Popover
      open={confirmationOpen}
      onOpenChange={handleConfirmationOpenChange}
    >
      <PopoverAnchor asChild>
        <div className="w-full">{row}</div>
      </PopoverAnchor>
      {confirmation}
    </Popover>
  );
}
