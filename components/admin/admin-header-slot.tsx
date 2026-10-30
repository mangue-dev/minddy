"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The admin pane's content header, where the open tab puts the controls that
 * drive it (period, filters, import and export) instead of the top of its
 * scrolling content. The shell (`admin-dashboard`) owns the strip; a tab
 * portals its controls into it.
 */
export const AdminHeaderSlotContext = createContext<HTMLElement | null>(null);

export function AdminHeaderActions({ children }: { children: ReactNode }) {
  const host = useContext(AdminHeaderSlotContext);
  return host ? createPortal(children, host) : null;
}
