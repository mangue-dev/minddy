"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type AppTooltipProps = {
  label: ReactNode;
  children: ReactElement;
  side?: ComponentProps<typeof TooltipContent>["side"];
  align?: ComponentProps<typeof TooltipContent>["align"];
};

/** The standard in-app replacement for a browser-native `title` tooltip. */
export function AppTooltip({
  label,
  children,
  side,
  align,
}: AppTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
