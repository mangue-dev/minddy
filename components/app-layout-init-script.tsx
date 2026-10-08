"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { APP_LAYOUT_BOOTSTRAP } from "@/lib/app-layout-bootstrap.generated";
import { useMobileLayout } from "@/lib/use-mobile-layout";

/** Initialize before paint and keep the shared layout observer alive across routes. */
export function AppLayoutInitScript() {
  useMobileLayout();
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: APP_LAYOUT_BOOTSTRAP }} />;
  });
  return null;
}
