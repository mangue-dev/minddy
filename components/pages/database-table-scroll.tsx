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

type ScrollbarGeometry = {
  left: number;
  width: number;
  contentWidth: number;
  visible: boolean;
};

export function DatabaseTableScroll({ children }: { children: ReactNode }) {
  const t = useTranslations("PageDatabase");
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<ScrollbarGeometry | null>(null);

  const sync = () => {
    const container = viewport.current;
    if (!container) return;
    if (scrollbar.current) {
      scrollbar.current.scrollLeft = container.scrollLeft;
      scrollbar.current.setAttribute(
        "aria-valuenow",
        String(container.scrollLeft),
      );
    }
  };

  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    const unbindPageScroll = bindDatabasePageScroll(container);
    let frame = 0;
    const measure = () => {
      const box = container.getBoundingClientRect();
      const left = Math.max(0, box.left);
      const width = Math.max(0, Math.min(window.innerWidth, box.right) - left);
      const next = {
        left,
        width,
        contentWidth: container.scrollWidth,
        visible:
          box.bottom > 0 &&
          box.top < window.innerHeight &&
          width > 0 &&
          container.scrollWidth > container.clientWidth + 1,
      };
      setGeometry((previous) =>
        previous &&
        previous.left === next.left &&
        previous.width === next.width &&
        previous.contentWidth === next.contentWidth &&
        previous.visible === next.visible
          ? previous
          : next,
      );
      sync();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      unbindPageScroll();
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, []);

  useLayoutEffect(sync, [geometry]);

  return (
    <>
      <div
        ref={viewport}
        id={id}
        className="no-scrollbar -ml-2 -mr-6 overflow-x-auto overscroll-x-none [container-type:inline-size] md:-ml-24 md:-mr-10"
        data-database-scroll
        onScroll={sync}
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
            className="scrollbar-quiet fixed bottom-0 z-30 h-3 overflow-x-auto overflow-y-hidden overscroll-x-none bg-background outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            style={{ left: geometry.left, width: geometry.width }}
            onScroll={(event) => {
              if (viewport.current)
                viewport.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
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
