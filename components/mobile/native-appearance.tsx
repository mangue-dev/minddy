"use client";

import { useEffect } from "react";
import { getMobileBridge } from "@/lib/mobile/bridge";

/**
 * What the page and the mobile shell tell each other about the device's look
 * (MIN-907). Renders nothing, and does nothing outside the mobile app.
 *
 * The page tells the shell which theme the product shows: it belongs to the
 * account and may differ from the system's, and without this a dark product
 * under a light system has black status-bar text on a dark page.
 *
 * The shell tells the page the radius of the screen's corners, published as
 * `--device-corner-radius`: the page sliding aside for the sidebar and the
 * bottom sheets take the shape of the device (app/globals.css).
 */
export function NativeMobileAppearance() {
  useEffect(() => {
    const shell = getMobileBridge()?.shell;
    if (!shell?.setAppearance) return;
    const root = document.documentElement;
    void shell.state().then((state) => {
      if (state.cornerRadius && state.cornerRadius > 0) {
        root.style.setProperty("--device-corner-radius", `${state.cornerRadius}px`);
      }
    }, () => {});
    let last: boolean | null = null;
    const report = () => {
      const dark = root.classList.contains("dark");
      if (dark === last) return;
      last = dark;
      shell.setAppearance?.({ dark }).catch(() => {});
    };
    report();
    const observer = new MutationObserver(report);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
