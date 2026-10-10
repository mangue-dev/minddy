"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "mangue-ui";
import type { DocumentationArticle } from "@/lib/documentation";

type Section = DocumentationArticle["sections"][number];

function ContentsList({ sections, activeId, label, onNavigate }: {
  sections: Section[];
  activeId: string | undefined;
  label: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState({ top: 6, height: 16 });
  useEffect(() => {
    const root = list.current;
    if (!root) return;
    const measure = () => {
      const row = root.querySelector<HTMLElement>('[aria-current="location"]');
      if (!row || !root.getBoundingClientRect().height) return;
      const bounds = row.getBoundingClientRect();
      const next = { top: bounds.top - root.getBoundingClientRect().top + 6, height: bounds.height - 12 };
      setIndicator(previous => previous.top === next.top && previous.height === next.height ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [activeId]);

  return <nav aria-label={label}>
    <div className="relative border-l-2 border-border">
      <span aria-hidden data-documentation-caret className="pointer-events-none absolute -left-0.5 top-0 w-0.5 rounded-full bg-foreground transition-[transform,height] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
        style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }} />
      <ul ref={list} className="text-[13px] leading-5">
        {sections.map(section => <li key={section.id}>
          <a href={`#${section.id}`} aria-current={section.id === activeId ? "location" : undefined}
            onClick={event => onNavigate(event, section.id)}
            className={`flex min-h-12 items-center py-3 text-muted-foreground transition-colors hover:text-foreground aria-[current=location]:text-foreground focus-visible:outline-2 focus-visible:outline-ring xl:min-h-0 xl:py-1 ${section.level === 3 ? "pl-6" : "pl-3"}`}>
            {section.title}
          </a>
        </li>)}
      </ul>
    </div>
  </nav>;
}

/** Keep the reading position and anchor feedback consistent on every screen. */
export function DocumentationContents({ sections, label }: { sections: Section[]; label: string }) {
  const [activeId, setActiveId] = useState<string | undefined>(sections[0]?.id);
  const [open, setOpen] = useState(false);
  const unflash = useRef<(() => void) | null>(null);

  useEffect(() => {
    const article = document.getElementById("documentation-article");
    if (!article) return;
    const targets = sections.map(section => document.getElementById(section.id)).filter((target): target is HTMLElement => !!target && article.contains(target));
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current: string | undefined = targets[0]?.id;
      // Read the last section above the reading line, including long sections without a visible heading.
      for (const target of targets) {
        const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        if (target.getBoundingClientRect().top <= margin + 24) current = target.id;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = targets.at(-1)?.id;
      setActiveId(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  useEffect(() => () => unflash.current?.(), []);

  const onNavigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    setActiveId(id);
    setOpen(false);
    // Immediate anchor scrolling makes the entire blue pulse visible on arrival, as in Pages.
    target.scrollIntoView({ block: "start", behavior: "instant" });
    target.focus({ preventScroll: true });
    unflash.current?.();
    const heading = target.querySelector<HTMLElement>("h2, h3") ?? target;
    const frame = requestAnimationFrame(() => heading.classList.add("page-block-target"));
    const timer = window.setTimeout(() => heading.classList.remove("page-block-target"), 1700);
    unflash.current = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      heading.classList.remove("page-block-target");
    };
  };

  if (!sections.length) return null;
  const contents = <ContentsList sections={sections} activeId={activeId} label={label} onNavigate={onNavigate} />;
  return <>
    <Collapsible data-documentation-mobile-contents open={open} onOpenChange={setOpen} className="fixed inset-x-0 top-24 z-20 border-b border-border bg-background px-6 sm:top-16 lg:left-72 xl:hidden">
      <CollapsibleTrigger aria-label={label} className="group flex h-12 w-full items-center justify-between gap-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
        <span className="truncate">{sections.find(section => section.id === activeId)?.title ?? sections[0].title}</span>
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90 motion-reduce:transition-none" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="motion-reduce:animate-none"><div className="max-h-[calc(100dvh-12rem)] overflow-y-auto pb-4">{contents}</div></CollapsibleContent>
    </Collapsible>
    <aside data-documentation-contents className="fixed bottom-0 right-0 top-16 hidden w-64 overflow-y-auto px-6 py-12 xl:block">{contents}</aside>
  </>;
}
