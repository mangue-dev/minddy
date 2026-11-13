"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { FIRST_RUN_PENDING_ATTRIBUTE, PROFILE_SETUP_SINCE, firstRunPendingFromCookies } from "@/lib/first-run";

/**
 * Covers the server-rendered app before its first paint when the session
 * belongs to a new account (MIN-964): the first-run screens are client-side,
 * so without it the app showed for a moment before them. The gate lifts the
 * cover once it has decided (components/first-run/first-run-gate.tsx).
 */
export function FirstRunCoverScript() {
  // The callback can fire at each flush of the stream: insert only once.
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    const script = `try{if((${firstRunPendingFromCookies.toString()})(document.cookie,${PROFILE_SETUP_SINCE}))document.documentElement.setAttribute(${JSON.stringify(FIRST_RUN_PENDING_ATTRIBUTE)},"")}catch(e){}`;
    return <script dangerouslySetInnerHTML={{ __html: script }} />;
  });
  return null;
}
