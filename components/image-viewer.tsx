"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const IMAGE_HERO_TRANSITION = {
  layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

type PreviewViewerProps = {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Replace the central control, using the supplied callback to dismiss the viewer. */
  action?: (close: () => void) => ReactNode;
  /** Images can dismiss on click; document and media controls must stay interactive. */
  closeOnContentClick?: boolean;
};

/** Native top-layer reader shared by documentation, resources and page blocks. */
export function PreviewViewer({ label, open, onOpenChange, children, action, closeOnContentClick = false }: PreviewViewerProps) {
  const t = useTranslations("Common");
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreScroll = useRef<(() => void) | null>(null);
  const close = () => onOpenChange(false);
  const finishClose = () => {
    if (open) return;
    dialog.current?.close();
    restoreScroll.current?.();
    restoreScroll.current = null;
  };

  useLayoutEffect(() => { setMounted(true); }, []);

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
  }, [open, mounted]);

  useLayoutEffect(() => () => {
    dialog.current?.close();
    restoreScroll.current?.();
  }, []);

  const duration = reducedMotion ? 0 : 0.55;
  if (!mounted) return null;
  return createPortal(<dialog ref={dialog} aria-label={label}
    onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); close(); }}
    className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-foreground outline-none backdrop:bg-transparent">
    <AnimatePresence onExitComplete={finishClose}>
      {open && <motion.div key="viewer" className="absolute inset-0 flex flex-col"
        initial="initial" animate="visible" exit="exit"
        onClick={event => {
          if (event.target === event.currentTarget) close();
        }}>
        <motion.div aria-hidden className="absolute inset-0 bg-background/70 backdrop-blur-2xl backdrop-saturate-150"
          variants={{ initial: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
          transition={{ duration, ease: [0.22, 1, 0.36, 1] }} />
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pt-4 sm:px-8 sm:pt-8"
          onClick={event => { if (closeOnContentClick || event.target === event.currentTarget) close(); }}>
          {children}
        </div>
        <motion.div className="relative flex shrink-0 cursor-auto justify-center px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          onClick={event => event.stopPropagation()}
          variants={{ initial: { opacity: 0, y: -8 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }}
          transition={{ duration: reducedMotion ? 0 : 0.32, delay: open && !reducedMotion ? 0.3 : 0 }}>
          {action ? action(close) : <Button data-preview-close type="button" variant="outline" className="min-h-12 min-w-40 rounded-full px-8" onClick={close}>{t("close")}</Button>}
        </motion.div>
      </motion.div>}
    </AnimatePresence>
  </dialog>, document.body);
}

/** An image reader retaining the documentation thumbnail's shared-element transition. */
export function ImageViewer({ src, alt, layoutId, ...props }: Omit<PreviewViewerProps, "children" | "closeOnContentClick"> & {
  src: string;
  alt: string;
  layoutId?: string;
}) {
  const reducedMotion = useReducedMotion();
  return <PreviewViewer {...props} closeOnContentClick>
    <motion.div layoutId={reducedMotion ? undefined : layoutId}
      transition={reducedMotion ? { duration: 0 } : IMAGE_HERO_TRANSITION}
      className="cursor-zoom-out overflow-hidden">
      <img src={src} alt={alt} draggable={false}
        className="block max-h-[calc(100dvh-9rem)] max-w-[calc(100vw-1rem)] select-none object-contain sm:max-w-[calc(100vw-4rem)]" />
    </motion.div>
  </PreviewViewer>;
}
