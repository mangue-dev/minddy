"use client";

import { useEffect } from "react";

/** Automatic redirection of the success interstitial to the
 client callback — location.replace to not leave the URL (with the code) in
 the browser history. */
export function AutoRedirect({ url, delayMs }: { url: string; delayMs: number }) {
  useEffect(() => {
    const id = window.setTimeout(() => window.location.replace(url), delayMs);
    return () => window.clearTimeout(id);
  }, [url, delayMs]);
  return null;
}
