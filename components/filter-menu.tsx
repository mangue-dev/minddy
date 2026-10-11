"use client";

import { createContext, useContext, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "mangue-ui";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const MobileFilters = createContext(false);
export function FilterItem({ onSelect, disabled, children, pressed }: React.ComponentProps<typeof DropdownMenuItem> & { pressed?: boolean }) {
  if (!useContext(MobileFilters)) return <DropdownMenuItem onSelect={onSelect} disabled={disabled}>{children}</DropdownMenuItem>;
  return <button type="button" disabled={disabled} aria-pressed={pressed}
    className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left hover:bg-control-hover disabled:opacity-50"
    onClick={(event) => onSelect?.(event.nativeEvent)}>{children}</button>;
}

/** One toggle row inside a filter submenu — Linear style: clicking toggles
    WITHOUT closing the menu (onSelect preventDefault), the check sits on the
    right. */
export function MenuToggleRow({
  active,
  onSelect,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <FilterItem
      pressed={active}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <HugeiconsIcon icon={CheckIcon} className="size-4 shrink-0" />}
    </FilterItem>
  );
}

/** One facet submenu of the filters menu: the trigger carries the facet name
    and, when the facet is active, how many values are selected — a bare
    number, the same count treatment as the sidebar. */
export function FilterSub({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (useContext(MobileFilters)) return <details className="group/filter rounded-xl">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <span className="shrink-0 tabular-nums text-muted-foreground">{count}</span>}
      <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open/filter:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="pl-3">{children}</div>
  </details>;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function FilterMenu({ open, onOpenChange, label, trigger, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; label: string;
  trigger: ReactNode; children: ReactNode;
}) {
  const mobile = useMobileLayout() === true;
  return <MobileFilters.Provider value={mobile}>
    {mobile ? <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{label}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </DialogContent>
    </Dialog> : <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger></TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60">{children}</DropdownMenuContent>
    </DropdownMenu>}
  </MobileFilters.Provider>;
}
