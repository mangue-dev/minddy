"use client";

import { useCallback, useEffect, useState } from "react";

type InstallOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: InstallOutcome; platform: string }>;
}

/** Capture Chromium's one-shot PWA install invitation for a user-triggered CTA. */
export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const clearPrompt = () => setPromptEvent(null);

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", clearPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", clearPrompt);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome | null> => {
    if (!promptEvent) return null;

    const currentPrompt = promptEvent;
    setPromptEvent(null);
    try {
      return (await currentPrompt.prompt()).outcome;
    } catch {
      return null;
    }
  }, [promptEvent]);

  return { canPrompt: promptEvent !== null, promptInstall };
}
