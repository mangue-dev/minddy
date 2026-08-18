"use client";

import { useEffect } from "react";

import { isDesktop } from "@/lib/desktop/bridge";

/**
 * The desktop app never displays the public site (MIN-291).
 *
 * The argument is aimed at someone who has not yet decided; In
 * the app installed, this person does not exist. She has already downloaded,
 * signed the first launch, and what she wants to see when opening the window,
 * it’s his work — or the screen that takes him there.
 *
 * **The destination is `/home`, not `/login`**, and that's what makes the
 * rule has only one case: the proxy y returns to `/login` when the session
 * missing, and returns the app when it is there. Aim `/login` directly
 * would cause the login screen to flash in front of someone who is
 * already connected.
 *
 * Mounted in the layout of the `(marketing)` group, it covers landing, prices,
 * changelog and the rest at once — including when you get there by
 * client navigation, which the main process does not see pass. The common case,
 * him, never reaches it: the window loads `/home` input
 * (desktop/src/main.ts).
 */
export function DesktopMarketingRedirect() {
  useEffect(() => {
    if (!isDesktop()) return;
    window.location.replace("/home");
  }, []);

  return null;
}
