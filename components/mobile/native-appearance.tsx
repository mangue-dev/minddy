"use client";

import { useEffect } from "react";
import { getMobileBridge, type MobileCornerRadii, type MobileFold } from "@/lib/mobile/bridge";

/** Where each corner's radius is published (app/globals.css reads them). */
const CORNER_PROPERTIES = [
  ["topLeft", "--device-corner-top-left"],
  ["topRight", "--device-corner-top-right"],
  ["bottomLeft", "--device-corner-bottom-left"],
  ["bottomRight", "--device-corner-bottom-right"],
] as const satisfies ReadonlyArray<readonly [keyof MobileCornerRadii, string]>;

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
 * bottom sheets take the shape of the device (app/globals.css). When it knows
 * each corner, it publishes them too (`--device-corner-top-left` and so on):
 * iPhone Duo's outer display is a D, square on the hinge side. It says them
 * again when the app moves to another display or turns, since a half turn
 * swaps the D's square and round corners.
 */
export function NativeMobileAppearance() {
  useEffect(() => {
    const shell = getMobileBridge()?.shell;
    if (!shell?.setAppearance) return;
    const root = document.documentElement;
    const setCorners = ({ cornerRadius, cornerRadii, fold }: { cornerRadius?: number; cornerRadii?: MobileCornerRadii; fold?: MobileFold | null }) => {
      setPixels("--device-corner-radius", cornerRadius);
      for (const [corner, property] of CORNER_PROPERTIES) setPixels(property, cornerRadii?.[corner]);
      setFold(fold ?? null);
    };
    // iPhone Duo half open: the display bends at the fold, and the sheets keep
    // to one side of it (app/globals.css, `data-fold`).
    const setFold = (fold: MobileFold | null) => {
      if (!fold) {
        root.removeAttribute("data-fold");
        root.style.removeProperty("--fold-start");
        root.style.removeProperty("--fold-end");
        return;
      }
      const vertical = fold.height > fold.width;
      root.setAttribute("data-fold", vertical ? "vertical" : "horizontal");
      root.style.setProperty("--fold-start", `${vertical ? fold.x : fold.y}px`);
      root.style.setProperty("--fold-end", `${vertical ? fold.x + fold.width : fold.y + fold.height}px`);
    };
    const setPixels = (property: string, value: number | undefined) => {
      if (value !== undefined && value > 0) root.style.setProperty(property, `${value}px`);
      else root.style.removeProperty(property);
    };
    const readCorners = () => void shell.state().then(setCorners, () => {});
    readCorners();
    // iPhone Duo: folding or unfolding moves the app to the other display.
    const display = shell.addListener?.("display", setCorners);
    // A half turn swaps the corners without a new size, which the shell does
    // not always report: ask again once the turn has settled.
    let turnTimer = 0;
    const turned = () => {
      window.clearTimeout(turnTimer);
      turnTimer = window.setTimeout(readCorners, 400);
    };
    screen.orientation?.addEventListener("change", turned);
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
    return () => {
      observer.disconnect();
      window.clearTimeout(turnTimer);
      screen.orientation?.removeEventListener("change", turned);
      setFold(null);
      if (display) void Promise.resolve(display).then((listener) => listener.remove(), () => {});
    };
  }, []);

  return null;
}
