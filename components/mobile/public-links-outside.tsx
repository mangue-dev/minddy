"use client";

import { useEffect } from "react";
import { openPublicLinksOutside } from "@/lib/mobile/public-links";

/**
 * In the mobile app, links to the public website open in Safari's sheet
 * rather than in the app (lib/mobile/public-links.ts). Renders nothing, and
 * does nothing outside the app.
 */
export function PublicLinksOutside() {
  useEffect(() => openPublicLinksOutside(document), []);
  return null;
}
