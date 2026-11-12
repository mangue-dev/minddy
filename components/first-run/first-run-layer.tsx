"use client";

import { useEffect, type ReactNode } from "react";
import { keyboardFrameStyle, useKeyboardFrame } from "@/lib/mobile/use-keyboard-frame";
import { cn } from "@/lib/utils";

/**
 * A page of its own over the app (MIN-907): the profile screen and the
 * phone's getting-started tour. The app stays mounted under it, set inert,
 * so the creation sheets the tour opens rise over this page and whatever
 * they create lands in the app waiting below.
 */
export function FirstRunLayer({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  const keyboard = useKeyboardFrame();
  const typing = keyboard.height !== null;

  useEffect(() => {
    const workspace = document.querySelector<HTMLElement>(".app-workspace");
    if (!workspace) return;
    workspace.inert = true;
    return () => {
      workspace.inert = false;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-first-run
      style={keyboardFrameStyle(keyboard)}
      className="fixed inset-0 z-[45] flex flex-col overflow-y-auto overscroll-contain bg-background px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className={cn("mx-auto flex w-full max-w-[380px] flex-1 flex-col items-center", typing ? "justify-start" : "justify-center")}>
        <div className="auth-stagger w-full">{children}</div>
      </div>
      {footer}
    </div>
  );
}
