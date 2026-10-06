"use client";

import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger, cn } from "mangue-ui";
import { PropertyRow, TRIGGER } from "@/components/issue-property-fields";

export type PrInsightTone = "danger" | "progress" | "success" | "neutral";

const PopoverActionContext = createContext<{
  close: () => void;
  skipFocusRestore: { current: boolean };
} | null>(null);

/** Close action popovers before opening a sidebar or dialog. */
export function PrInsightPopover({ children, open, onOpenChange }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const skipFocusRestore = useRef(false);
  const changeOpen = (next: boolean) => {
    if (next) skipFocusRestore.current = false;
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  return (
    <PopoverActionContext.Provider value={{ close: () => changeOpen(false), skipFocusRestore }}>
      <Popover open={open ?? localOpen} onOpenChange={changeOpen}>{children}</Popover>
    </PopoverActionContext.Provider>
  );
}

export function PrInsightPopoverContent(props: ComponentProps<typeof PopoverContent>) {
  const actions = useContext(PopoverActionContext);
  return (
    <PopoverContent
      {...props}
      onClickCapture={(event) => {
        props.onClickCapture?.(event);
        const button = event.target instanceof Element ? event.target.closest("button") : null;
        if (!event.defaultPrevented && button && !button.disabled && !button.hasAttribute("data-keep-popover-open") && actions) {
          actions.skipFocusRestore.current = true;
          actions.close();
        }
      }}
      onCloseAutoFocus={(event) => {
        props.onCloseAutoFocus?.(event);
        // The destination sidebar or dialog owns focus after a navigation action.
        if (actions?.skipFocusRestore.current) event.preventDefault();
      }}
    />
  );
}

/** Match ticket property values while keeping details outside the page flow. */
export function PrInsightRow({
  label,
  tone,
  summary,
  children,
  testId,
  detailsTestId,
  ariaLabel,
  showChevron = true,
  showTitle = true,
  open,
  onOpenChange,
}: {
  label: string;
  tone?: PrInsightTone;
  summary: ReactNode;
  children: ReactNode;
  testId: string;
  detailsTestId?: string;
  ariaLabel?: string;
  showChevron?: boolean;
  showTitle?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <PropertyRow label={label} labelClassName={tone === "danger" ? "text-destructive" : undefined}>
      <PrInsightPopover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel ?? label}
            data-testid={testId}
            className={cn(TRIGGER, "mr-0 min-w-0")}
          >
            {summary}
            {showChevron ? (
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            ) : null}
          </button>
        </PopoverTrigger>
        <PrInsightPopoverContent
          align="end"
          data-testid={detailsTestId}
          aria-label={label}
          className="w-[min(26rem,calc(100vw-2rem))] p-3"
        >
          {showTitle ? <h3 className="mb-3 text-sm font-medium">{label}</h3> : null}
          <div className="max-h-[min(28rem,60dvh)] min-w-0 overflow-y-auto">
            {children}
          </div>
        </PrInsightPopoverContent>
      </PrInsightPopover>
    </PropertyRow>
  );
}
