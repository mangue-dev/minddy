"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TooltipPortalContainer } from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

export const IMAGE_HERO_TRANSITION = {
  layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const ENTER_DURATION = 0.3;
const EXIT_DURATION = 0.18;

/**
 * Events that must not leave the reader. A Radix modal below (the issue side
 * panel, a dialog, a sheet) listens on the document: for pointer-down and
 * focus outside its content, which close it, and for wheel and touch moves,
 * which its scroll lock cancels. The reader sits above it in the top layer, so
 * none of its interactions belong to that layer.
 */
const ISOLATED_EVENTS = [
  "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "click", "dblclick", "contextmenu",
  "touchstart", "touchmove", "touchend", "wheel", "focusin", "focusout", "keydown", "keyup",
] as const;

/** The React tree still bubbles through a portal: stop there as well. */
const stopReactPropagation = (event: SyntheticEvent) => event.stopPropagation();

/** Mark a reader host so code below it can tell the reader is open. */
export const PREVIEW_VIEWER_ATTRIBUTE = "data-preview-viewer";

function createReaderHost(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute(PREVIEW_VIEWER_ATTRIBUTE, "");
  // React dispatches its own events on the portal container first; stopping
  // the native event here keeps it from reaching the document listeners.
  const stop = (event: Event) => event.stopPropagation();
  for (const name of ISOLATED_EVENTS) host.addEventListener(name, stop);
  document.body.appendChild(host);
  return host;
}

type PreviewViewerProps = {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Replace the central control, using the supplied callback to dismiss the viewer. */
  action?: (close: () => void) => ReactNode;
  /**
   * Whether a click on the content or its margins dismisses the reader. Off by
   * default: file readers close only with Close or Escape, so their content,
   * scroll and menus stay usable. The documentation zoom opts in.
   */
  closeOnContentClick?: boolean;
  /** The content flies in from its thumbnail (shared layout id): no fade or scale on entry. */
  hero?: boolean;
};

/** Native top-layer reader shared by documentation, resources, page blocks and pull requests. */
export function PreviewViewer({ label, open, onOpenChange, children, action, closeOnContentClick = false, hero = false }: PreviewViewerProps) {
  const t = useTranslations("Common");
  // A fresh host per opening: an overlay opened earlier marks the body's
  // existing children aria-hidden, which must not reach the reader.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  // The dialog element, as state: the tooltips of the reader portal into it.
  const [dialogElement, setDialogElement] = useState<HTMLDialogElement | null>(null);
  const bindDialog = useCallback((element: HTMLDialogElement | null) => {
    dialog.current = element;
    setDialogElement(element);
  }, []);
  const restoreScroll = useRef<(() => void) | null>(null);
  const close = () => onOpenChange(false);
  const finishClose = () => {
    if (open) return;
    dialog.current?.close();
    restoreScroll.current?.();
    restoreScroll.current = null;
    setHost(null);
  };

  useLayoutEffect(() => {
    if (open && !host) setHost(createReaderHost());
  }, [open, host]);

  useLayoutEffect(() => () => { host?.remove(); }, [host]);

  useLayoutEffect(() => {
    if (!open || !dialog.current || dialog.current.open) return;
    // The native modal keeps focus inside and makes the page inert on every viewport.
    const modal = dialog.current;
    const previousFocus = document.activeElement;
    modal.showModal();
    modal.querySelector<HTMLButtonElement>("[data-preview-close]")?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    restoreScroll.current = () => {
      modal.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
        // Exit animations may remove the last focused control after this callback.
        requestAnimationFrame(() => {
          if (!modal.open && previousFocus.isConnected && document.activeElement === document.body) previousFocus.focus({ preventScroll: true });
        });
      }
    };
  }, [open, host]);

  useLayoutEffect(() => () => {
    dialog.current?.close();
    restoreScroll.current?.();
  }, []);

  // Escape belongs to the reader while it is open. A layer below (the issue
  // side panel, a sheet) listens on the document in the capture phase and
  // would close as well; the window's capture phase runs first. The reader's
  // own actions menu keeps its Escape, which closes only the menu.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dialog.current?.open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[role=menu]") && dialog.current.contains(target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onOpenChange]);

  // Entry is gentle; exit is short and fades backdrop and content together,
  // so the page never shows through a lingering foreground.
  const timing = (enter: number, exit: number, delay = 0) => reducedMotion ? { duration: 0 }
    : open ? { duration: enter, ease: EASE_OUT, delay } : { duration: exit, ease: EASE_OUT };
  const dismissOnClick = closeOnContentClick ? close : undefined;
  if (!host) return null;
  return createPortal(<dialog ref={bindDialog} aria-label={label}
    onClick={stopReactPropagation} onPointerDown={stopReactPropagation} onPointerUp={stopReactPropagation}
    onPointerMove={stopReactPropagation} onMouseDown={stopReactPropagation} onWheel={stopReactPropagation}
    onTouchStart={stopReactPropagation} onTouchMove={stopReactPropagation} onContextMenu={stopReactPropagation}
    onKeyDown={stopReactPropagation}
    onCancel={event => { event.preventDefault(); close(); }}
    // A Radix modal below sets `pointer-events: none` on the body, which the
    // dialog would inherit even in the top layer.
    className="pointer-events-auto fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-transparent">
    <TooltipPortalContainer container={dialogElement}>
    <AnimatePresence onExitComplete={finishClose}>
      {open && <motion.div key="viewer" className="absolute inset-0 flex flex-col"
        initial="initial" animate="visible" exit="exit" onClick={dismissOnClick}>
        <motion.div aria-hidden className="absolute inset-0 bg-background/70 backdrop-blur-2xl backdrop-saturate-150"
          variants={{ initial: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
          transition={timing(ENTER_DURATION, EXIT_DURATION)} />
        <motion.div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pt-4 sm:px-8 sm:pt-8"
          variants={hero
            ? { initial: { opacity: 1 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
            : { initial: { opacity: 0, scale: 0.98, y: 8 }, visible: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 0 } }}
          transition={timing(ENTER_DURATION, EXIT_DURATION)}>
          {children}
        </motion.div>
        <motion.div className="relative flex shrink-0 cursor-auto justify-center px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          onClick={event => event.stopPropagation()}
          variants={{ initial: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 0 } }}
          transition={timing(0.24, EXIT_DURATION, 0.12)}>
          {action ? action(close) : <Button data-preview-close type="button" variant="outline" className="min-h-12 min-w-40 rounded-full px-8" onClick={close}>{t("close")}</Button>}
        </motion.div>
      </motion.div>}
    </AnimatePresence>
    </TooltipPortalContainer>
  </dialog>, host);
}

/** An image reader; with a `layoutId`, the image flies from and back to its thumbnail. */
export function ImageViewer({ src, alt, layoutId, closeOnContentClick = false, ...props }: Omit<PreviewViewerProps, "children" | "hero"> & {
  src: string;
  alt: string;
  layoutId?: string;
}) {
  const reducedMotion = useReducedMotion();
  const hero = !reducedMotion && !!layoutId;
  return <PreviewViewer {...props} closeOnContentClick={closeOnContentClick} hero={hero}>
    <motion.div layoutId={hero ? layoutId : undefined}
      transition={hero ? IMAGE_HERO_TRANSITION : { duration: 0 }}
      className={closeOnContentClick ? "cursor-zoom-out overflow-hidden" : "overflow-hidden"}>
      <img src={src} alt={alt} draggable={false}
        className="block max-h-[calc(100dvh-9rem)] max-w-[calc(100vw-1rem)] select-none object-contain sm:max-w-[calc(100vw-4rem)]" />
    </motion.div>
  </PreviewViewer>;
}
