import { useSyncExternalStore } from "react";

import { isDesktop } from "@/lib/desktop/bridge";
import { isNativeMobile } from "@/lib/mobile/bridge";

/**
 * True inside an installed minddy app, desktop or mobile: someone who has
 * already installed the product, so the public site and the install prompts
 * have nothing to tell them.
 */
export function isNativeApp(): boolean {
  return isDesktop() || isNativeMobile();
}

const subscribe = () => () => {};

/**
 * `isNativeMobile()` for rendering. The server and the hydration pass read
 * `false`; React re-renders with the real value before the first paint, so a
 * surface hidden in the mobile app does not flash.
 */
export function useNativeMobile(): boolean {
  return useSyncExternalStore(subscribe, isNativeMobile, () => false);
}

/**
 * The mobile apps sell nothing (MIN-907): subscriptions are bought on the web
 * and the app recognizes them. Every surface that leads to a purchase (the
 * billing page, plan cards, upgrade buttons, links to plans) renders nothing
 * while this is true, on iOS and Android alike.
 */
export function usePurchasesHidden(): boolean {
  return useNativeMobile();
}
