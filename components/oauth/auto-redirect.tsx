"use client";

import { useEffect } from "react";

/** Redirection automatique de l'interstitiel de succès vers le callback du
    client — location.replace pour ne pas laisser l'URL (avec le code) dans
    l'historique du navigateur. */
export function AutoRedirect({ url, delayMs }: { url: string; delayMs: number }) {
  useEffect(() => {
    const id = window.setTimeout(() => window.location.replace(url), delayMs);
    return () => window.clearTimeout(id);
  }, [url, delayMs]);
  return null;
}
