"use client";

import { useEffect, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import type { StatusMeta } from "@/lib/issue-constants";

/** One page per column exists only below the board's 640px breakpoint. */
export function BoardColumnDots({ statuses, scroller }: {
  statuses: StatusMeta[];
  scroller: RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("Status");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => {
      if (!media.matches) return;
      const columns = [...node.children] as HTMLElement[];
      const start = columns[0]?.offsetLeft ?? 0;
      let closest = 0;
      let distance = Infinity;
      columns.forEach((column, index) => {
        const offset = Math.min(column.offsetLeft - start, Math.max(0, node.scrollWidth - node.clientWidth));
        const next = Math.abs(node.scrollLeft - offset);
        if (next < distance) { closest = index; distance = next; }
      });
      setActive((previous) => previous === closest ? previous : closest);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    media.addEventListener("change", update);
    const resize = new ResizeObserver(update);
    resize.observe(node);
    return () => { node.removeEventListener("scroll", update); media.removeEventListener("change", update); resize.disconnect(); };
  }, [scroller, statuses.length]);
  if (statuses.length <= 1) return null;
  return <div data-board-pagination className="flex shrink-0 justify-center bg-background px-4 sm:hidden">
    {statuses.map((status, index) => <button key={status.value} type="button"
      aria-label={t(status.value)} aria-current={index === active ? "true" : undefined}
      onClick={() => {
        const node = scroller.current;
        const column = node?.children[index] as HTMLElement | undefined;
        const first = node?.firstElementChild as HTMLElement | null;
        if (node && column && first) node.scrollTo({ left: column.offsetLeft - first.offsetLeft, behavior: "smooth" });
      }}
      className="flex h-11 w-8 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden className={cn("h-1.5 rounded-full transition-all", index === active ? "w-4 bg-foreground" : "w-1.5 bg-muted-foreground/30")} />
    </button>)}
  </div>;
}
