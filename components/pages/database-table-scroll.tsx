"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { bindDatabasePageScroll } from "@/lib/database-page-scroll";
import { bindDatabaseScrollSync } from "@/lib/database-scroll-sync";
import { cn } from "@/lib/utils";

type ScrollbarGeometry = {
  left: number;
  width: number;
  /** Distance from the window's bottom edge: the panel's bottom in a panel. */
  bottom: number;
  contentWidth: number;
  visible: boolean;
};

export function DatabaseTableScroll({
  children,
  panel = false,
}: {
  children: ReactNode;
  /** In a side panel the panel plays the page's part: horizontal gestures
      anywhere in it scroll the table, and the floating scrollbar keeps to
      the panel's bottom edge, not the window's (whose page lies beneath). */
  panel?: boolean;
}) {
  const t = useTranslations("PageDatabase");
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<ScrollbarGeometry | null>(null);

  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const scope = panel ? container.closest<HTMLElement>('[data-slot="side-panel-content"]') : null;
    const unbindPageScroll = bindDatabasePageScroll(container, scope);
    let frame = 0;
    const measure = () => {
      const box = container.getBoundingClientRect();
      const bounds = scope?.getBoundingClientRect() ??
        { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const left = Math.max(bounds.left, box.left);
      const width = Math.max(0, Math.min(bounds.right, box.right) - left);
      const next = {
        left,
        width,
        bottom: Math.max(0, window.innerHeight - bounds.bottom),
        contentWidth: container.scrollWidth,
        visible:
          box.bottom > bounds.top &&
          box.top < bounds.bottom &&
          width > 0 &&
          container.scrollWidth > container.clientWidth + 1,
      };
      setGeometry((previous) =>
        previous &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.bottom === next.bottom &&
        previous.contentWidth === next.contentWidth &&
        previous.visible === next.visible
          ? previous
          : next,
      );
    };
    const schedule = (event?: Event) => {
      // Horizontal movement changes the value, never the viewport geometry.
      if (
        event?.type === "scroll" &&
        (event.target === container || event.target === scrollbar.current)
      )
        return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const observer = new ResizeObserver(() => schedule());
    observer.observe(container);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    // A side panel slides in with a transform, which no resize reports: the
    // scrollbar is placed again once its animation ends.
    const settled = () => schedule();
    scope?.addEventListener("animationend", settled);
    scope?.addEventListener("transitionend", settled);
    measure();
    return () => {
      unbindPageScroll();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      scope?.removeEventListener("animationend", settled);
      scope?.removeEventListener("transitionend", settled);
    };
  }, [panel]);

  useLayoutEffect(() => {
    if (viewport.current && scrollbar.current)
      return bindDatabaseScrollSync(viewport.current, scrollbar.current);
  }, [geometry]);

  return (
    <>
      <div
        ref={viewport}
        id={id}
        // `overflow-y-hidden`: an `auto` on one axis turns the other to `auto`
        // too, and the table scrolled vertically by a few pixels for nothing.
        // On a phone the table runs edge to edge; the gutter's reserve on the
        // left is a desktop affair.
        className={cn(
          "-mx-6 overflow-x-auto overflow-y-hidden overscroll-x-none [container-type:inline-size]",
          // A database in the panel is inset by the gutter and selection
          // columns on the left (page-view.tsx), as on the full page, so its
          // title and toolbar line up with the Name column.
          panel ? "no-scrollbar app-desktop:-ml-24 app-desktop:-mr-16" : "no-scrollbar md:-ml-24 md:-mr-10",
        )}
        data-database-scroll
      >
        {children}
      </div>
      {geometry?.visible &&
        createPortal(
          <div
            ref={scrollbar}
            role="scrollbar"
            aria-label={t("horizontalScroll")}
            aria-controls={id}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, geometry.contentWidth - geometry.width)}
            aria-valuenow={viewport.current?.scrollLeft ?? 0}
            tabIndex={0}
            data-database-scrollbar
            className={cn(
              "scrollbar-quiet fixed z-30 h-3 overflow-x-auto overflow-y-hidden overscroll-x-none bg-transparent outline-none pointer-coarse:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              // Above the panel, and taking the pointer back under its overlay.
              panel && "pointer-events-auto z-[60]",
            )}
            style={{ left: geometry.left, width: geometry.width, bottom: geometry.bottom }}
            onKeyDown={(event) => {
              const container = viewport.current;
              if (!container) return;
              const offsets: Record<string, number> = {
                ArrowLeft: -40,
                ArrowRight: 40,
                PageUp: -container.clientWidth,
                PageDown: container.clientWidth,
                Home: -container.scrollWidth,
                End: container.scrollWidth,
              };
              if (event.key in offsets) {
                event.preventDefault();
                container.scrollLeft += offsets[event.key];
              }
            }}
          >
            <div className="h-px" style={{ width: geometry.contentWidth }} />
          </div>,
          document.body,
        )}
    </>
  );
}
