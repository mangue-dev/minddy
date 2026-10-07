"use client";

import type { ComponentProps } from "react";
import { CommandList as DesktopList } from "mangue-ui";
import { MobileSheetScrollArea } from "./mobile-sheet";

/** Every mobile option list uses the same scroll fade, including model catalogs. */
export function CommandList(props: ComponentProps<typeof DesktopList>) {
  return <MobileSheetScrollArea asChild><DesktopList {...props} /></MobileSheetScrollArea>;
}
