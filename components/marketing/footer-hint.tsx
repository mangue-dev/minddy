"use client";

import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The tooltip for the two footer contact address gestures: copy,
 * write.
 *
 * It lives in ITS file for one reason only: a Radix tooltip draws the
 * floating positioner, and the footer is rendered by the SIX pages
 * public. Imported from [marketing-footer.tsx](marketing-footer.tsx), it
 * would go into everyone's initial bundle — exactly what MIN-100 spent his time removing. Isolated here, it becomes a `dynamic()` that the
 * footer only rises when approached, like the language selector.
 *
 * Hence the “envelope” form rather than a complete component: the wrapped
 * element — the link `mailto:` — remains written in the footer, therefore rendered
 * on the server side and readable without JavaScript. The tooltip just lands
 * on it when it arrives.
 */
export function FooterHint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
