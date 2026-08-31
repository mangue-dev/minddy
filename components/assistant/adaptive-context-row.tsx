"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";

export interface AdaptiveContextItem {
  key: string;
  render: () => React.ReactNode;
}

const GAP = 6;
const OVERFLOW_TRIGGER_WIDTH = 40;

/** Composer variant: one native horizontal strip, without an overflow counter. */
export function ScrollableContextRow({
  items,
  className,
}: {
  items: AdaptiveContextItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <div className="flex w-max items-center gap-1.5">
        {items.map((item) => (
          <div key={item.key} className="shrink-0">
            {item.render()}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Keeps message context on one line. Item widths are measured off-screen so a
 * resize can reveal or hide items without guessing from labels or breakpoints.
 */
export function AdaptiveContextRow({
  items,
  align = "start",
  className,
}: {
  items: AdaptiveContextItem[];
  align?: "start" | "end";
  className?: string;
}) {
  const t = useTranslations("Assistant");
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef(new Map<string, HTMLDivElement>());
  const [visibleCount, setVisibleCount] = useState(items.length);
  const itemKey = useMemo(
    () => items.map((item) => item.key).join("\u0000"),
    [items],
  );

  const measure = useCallback(() => {
    const available = containerRef.current?.clientWidth ?? 0;
    if (!available) return;

    const widths = items.map(
      (item) => measureRefs.current.get(item.key)?.getBoundingClientRect().width ?? 0,
    );
    if (widths.some((width) => width === 0)) return;

    const fullWidth =
      widths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, widths.length - 1) * GAP;
    if (fullWidth <= available) {
      setVisibleCount(items.length);
      return;
    }

    const itemSpace = Math.max(
      0,
      available - OVERFLOW_TRIGGER_WIDTH - GAP,
    );
    let used = 0;
    let nextVisible = 0;
    for (const width of widths) {
      const nextWidth = used + (nextVisible > 0 ? GAP : 0) + width;
      if (nextWidth > itemSpace) break;
      used = nextWidth;
      nextVisible += 1;
    }
    setVisibleCount(nextVisible);
  }, [items]);

  useLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const element of measureRefs.current.values()) observer.observe(element);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [itemKey, measure]);

  if (items.length === 0) return null;

  const hiddenCount = items.length - visibleCount;
  return (
    <div
      ref={containerRef}
      className={cn("relative min-w-0 overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center gap-1.5",
          align === "end" && "justify-end",
        )}
      >
        {items.slice(0, visibleCount).map((item) => (
          <div key={item.key} className="min-w-0 shrink-0">
            {item.render()}
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="relative shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t("contextMore", { count: hiddenCount })}
                  className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-foreground/15 hover:bg-accent hover:text-foreground"
                >
                  +{hiddenCount}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align={align}
                sideOffset={6}
                className="w-[min(22rem,calc(100vw-2rem))] p-3"
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("contextOverview")}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {items.map((item) => (
                    <div key={item.key} className="min-w-0 max-w-full">
                      {item.render()}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none invisible fixed -left-[10000px] top-0 flex w-max items-center gap-1.5"
      >
        {items.map((item) => (
          <div
            key={item.key}
            ref={(element) => {
              if (element) measureRefs.current.set(item.key, element);
              else measureRefs.current.delete(item.key);
            }}
            className="shrink-0"
          >
            {item.render()}
          </div>
        ))}
      </div>
    </div>
  );
}
