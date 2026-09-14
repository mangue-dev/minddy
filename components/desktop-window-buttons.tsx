"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  useAnyModalOpen,
  useHoldWindowButtons,
  useWideLayout,
  useWindowButtonsSlot,
} from "@/lib/use-window-buttons";
import { desktopBridgePlatform, getDesktopBridge } from "@/lib/desktop/bridge";
import { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

export { WINDOW_BUTTONS_WIDTH } from "@/lib/sidebar-window-controls";

/** Use stable renderer-owned controls throughout the authenticated macOS app. */
export function DesktopWindowButtons() {
  useHoldWindowButtons("modal", useAnyModalOpen());
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge || desktopBridgePlatform(bridge, navigator.platform) !== "darwin" || !bridge.setCustomWindowControls) return;
    bridge.setCustomWindowControls(true);
    return () => bridge.setCustomWindowControls?.(false);
  }, []);
  return null;
}

/**
 * Renderer-owned controls keep the slot stable across dialogs. Native controls
 * return in full screen, where macOS owns their reveal and exit behavior.
 */
const DECOY_COLORS = ["#FF5F57", "#FEBC2E", "#28C840"];

export function WindowButtonDecoys() {
  const t = useTranslations("WindowControls");
  const bridge = getDesktopBridge();
  const controls = [
    { action: "close" as const, color: DECOY_COLORS[0], label: t("close") },
    { action: "minimize" as const, color: DECOY_COLORS[1], label: t("minimize") },
    { action: "fullscreen" as const, color: DECOY_COLORS[2], label: t("fullscreen") },
  ];
  return (
    <div
      className="group/window-controls fixed top-[15px] left-[19px] z-40 flex gap-[9px]"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {controls.map(({ action, color, label }) => (
        <button key={action} type="button" aria-label={label}
          onClick={() => bridge?.performWindowControl?.(action)}
          className="flex size-3.5 items-center justify-center rounded-full outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: color }}>
          <WindowControlGlyph action={action} />
        </button>
      ))}
    </div>
  );
}

function WindowControlGlyph({ action }: { action: "close" | "minimize" | "fullscreen" }) {
  const className = "size-2 opacity-0 transition-opacity group-hover/window-controls:opacity-100";
  if (action === "close") {
    return <svg viewBox="0 0 85.4 85.4" className={className} aria-hidden>
      <path d="m22.5 57.8 35.3-35.3c1.4-1.4 3.6-1.4 5 0l.1.1c1.4 1.4 1.4 3.6 0 5L27.6 62.9c-1.4 1.4-3.6 1.4-5 0l-.1-.1c-1.3-1.4-1.3-3.6 0-5Z" fill="#7e0b05" />
      <path d="m27.6 22.5 35.3 35.3c1.4 1.4 1.4 3.6 0 5l-.1.1c-1.4 1.4-3.6 1.4-5 0L22.5 27.6c-1.4-1.4-1.4-3.6 0-5l.1-.1c1.4-1.3 3.6-1.3 5 0Z" fill="#7e0b05" />
    </svg>;
  }
  if (action === "minimize") {
    return <svg viewBox="0 0 85.4 85.4" className={className} aria-hidden>
      <path d="M17.8 39.1h49.9c1.9 0 3.5 1.6 3.5 3.5v.1c0 1.9-1.6 3.5-3.5 3.5H17.8c-1.9 0-3.5-1.6-3.5-3.5v-.1c0-1.9 1.5-3.5 3.5-3.5Z" fill="#8c5415" />
    </svg>;
  }
  return <svg viewBox="0 0 85.4 85.4" className={className} aria-hidden>
    <path d="M31.2 20.8h26.7c3.6 0 6.5 2.9 6.5 6.5V54L31.2 20.8Zm23.2 43.7H27.6c-3.6 0-6.5-2.9-6.5-6.5V31.2l33.3 33.3Z" fill="#176b13" />
  </svg>;
}

/** Reserve native macOS controls in the content header below 768 px. */
const HEADER_PADDING_PX = 16;

export function HeaderWindowButtonsSlot() {
  const slot = useWindowButtonsSlot(!useWideLayout());
  if (!slot.reserved) return null;
  return (
    <>
      {slot.decoy && <WindowButtonDecoys />}
      <div
        aria-hidden
        className="shrink-0"
        style={{ width: WINDOW_BUTTONS_WIDTH - HEADER_PADDING_PX }}
      />
    </>
  );
}
