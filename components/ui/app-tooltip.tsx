"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Kbd } from "./kbd";
import { Tooltip, TooltipContent, TooltipTrigger, useTooltipScope } from "./tooltip";

type AppTooltipProps = {
  label: ReactNode;
  children: ReactElement;
  /** Keys of the shortcut that performs the same action, e.g. `["⌘", "K"]`. */
  shortcut?: readonly string[];
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
};

/** The standard in-app replacement for a browser-native `title` tooltip. */
export function AppTooltip({
  label,
  children,
  shortcut,
  side,
  align,
}: AppTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        align={align}
        className={shortcut?.length ? "flex items-center gap-1.5" : undefined}
      >
        {label}
        {shortcut?.length ? <ShortcutKeys keys={shortcut} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <Kbd key={`${index}-${key}`} size="sm">
          {key}
        </Kbd>
      ))}
    </span>
  );
}

/**
 * The tooltip an icon-only `Button` gives itself (MIN-724): its accessible
 * name, shown on hover and keyboard focus. It stands aside when no tooltip
 * provider is mounted (isolated renders, e-mails) and when a caller already
 * wraps the button in its own tooltip, which then wins.
 */
export function SelfLabelTooltip({
  label,
  shortcut,
  children,
}: {
  label: ReactNode;
  shortcut?: readonly string[];
  children: ReactElement;
}) {
  const scope = useTooltipScope();
  if (!scope.provided || scope.insideTrigger) return children;
  return (
    <AppTooltip label={label} shortcut={shortcut}>
      {children}
    </AppTooltip>
  );
}
