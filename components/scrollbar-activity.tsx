"use client";

import { useEffect } from "react";

import { trackScrollbarActivity } from "@/lib/scrollbar-activity";

/** Shows a scrollbar while it scrolls, then fades it (lib/scrollbar-activity.ts). */
export function ScrollbarActivity() {
  useEffect(() => trackScrollbarActivity(), []);
  return null;
}
