"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { COMPARISONS } from "@/lib/comparisons";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { PlatformLogo } from "./download-platform-cards";
import { PLATFORM_NAMES, useInstallPlatform } from "./platform-download-link";

export type ProductEntryKey =
  | "ai"
  | "tracker"
  | "speed"
  | "agents"
  | "pages"
  | "more"
  | "mcp"
  | "selfHosting"
  | "compare"
  | "changelog"
  | "download";

export type ProductEntry = {
  /** Translation keys use `navMenu_<key>_title`, and `navMenu_<key>_desc` in the first two groups. */
  key: ProductEntryKey;
  href: string;
};

/** The landing's six sections in its order, three by three, then the product's own pages. */
const GROUPS: ReadonlyArray<ReadonlyArray<ProductEntryKey>> = [
  ["ai", "agents", "tracker"],
  ["pages", "speed", "more"],
  ["mcp", "selfHosting", "compare", "changelog"],
];
const CLOSE_DELAY_MS = 140;

/** Grouped navigation links with a hover bridge and native keyboard tab order. */
export function NavProductMenu({
  entries, label, locale, className,
}: {
  entries: ReadonlyArray<ProductEntry>;
  label: string;
  locale: Locale;
  className?: string;
}) {
  const t = useTranslations("Landing");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pointerType = useRef("");
  const closeTimer = useRef<number | null>(null);
  const download = entries.find(entry => entry.key === "download");
  const platform = useInstallPlatform();

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) setOpen(false);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("flex h-16 items-center", className)}
      onPointerEnter={event => {
        if (event.pointerType !== "mouse") return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={scheduleClose}
      onFocus={cancelClose}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}>
      <button ref={triggerRef} type="button" aria-expanded={open} aria-controls={panelId}
        onPointerDown={event => { pointerType.current = event.pointerType; }}
        onClick={event => {
          cancelClose();
          // A mouse click should keep the menu opened by hover; touch and keyboard toggle it.
          setOpen(value => event.detail > 0 && pointerType.current === "mouse" ? true : !value);
        }}
        onKeyDown={event => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          cancelClose();
          setOpen(true);
          requestAnimationFrame(() => panelRef.current?.querySelector("a")?.focus());
        }}
        className={cn(
          "flex items-center gap-1 rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          open ? "text-foreground" : "hover:text-foreground",
        )}>
        {label}
        <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden className={cn("size-3.5 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>

      {/* Position against the full-width header so long translations cannot push the panel offscreen. */}
      <div ref={panelRef} id={panelId} inert={!open} aria-hidden={!open}
        className={cn("absolute top-full left-1/2 z-50 w-[min(calc(100vw-3rem),58rem)] -translate-x-1/2 pt-2 whitespace-normal", !open && "pointer-events-none")}>
        <div className={cn(
          "overflow-hidden rounded-[calc(var(--radius-xl)+9px)] border border-border bg-popover p-2 shadow-xl shadow-black/10",
          "origin-top transition-[opacity,transform,visibility] duration-200 motion-reduce:transition-none",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0",
        )}>
          <div className="grid grid-cols-[1fr_1fr_0.9fr] rounded-xl bg-[#f3f5ef] py-5 dark:bg-[#252b27]">
            {GROUPS.map((group, index) => (
              <ul key={group[0]} className={cn("min-w-0 space-y-1 px-4", index > 0 && "border-l border-foreground/10")}>
                {group.map(key => {
                  const entry = entries.find(item => item.key === key);
                  if (!entry) return null;
                  if (key === "compare") {
                    // One row, one link per comparison page.
                    return (
                      <li key={key} className="px-3 py-3">
                        <span className="block text-sm leading-snug font-medium text-foreground">{t("navMenu_compare_title")}</span>
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                          {COMPARISONS.map(comparison => (
                            <a key={comparison.slug} href={localizedHref(`/alternatives/${comparison.slug}`, locale)} onClick={() => setOpen(false)}
                              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                              {comparison.name}
                            </a>
                          ))}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={key}>
                      <a href={localizedHref(entry.href, locale)} onClick={() => setOpen(false)}
                        className="block rounded-lg px-3 py-3 transition-colors hover:bg-background/65 focus-visible:bg-background/65 focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="block text-sm leading-snug font-medium text-foreground">{t(`navMenu_${key}_title`)}</span>
                        {index < 2 && key !== "changelog" && <span className="mt-1.5 block text-[13px] leading-relaxed text-pretty text-muted-foreground">{t(`navMenu_${key}_desc`)}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
          {download && <a href={localizedHref(download.href, locale) + (platform === "unsupported" ? "" : `#${platform}`)} onClick={() => setOpen(false)}
            className="mt-2 flex items-center justify-between gap-6 rounded-xl px-7 py-4 transition-colors hover:bg-[#eaf0f4] focus-visible:bg-[#eaf0f4] focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-[#283139] dark:focus-visible:bg-[#283139]">
            <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-2 text-sm leading-none font-medium text-foreground">
                {platform !== "unsupported" && <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden><PlatformLogo platform={platform} /></span>}
                {platform === "unsupported" ? t("downloadMinddy") : t("downloadFor", { platform: PLATFORM_NAMES[platform] })}
              </span>
              <span className="text-[13px] leading-none text-muted-foreground">{t("navMenu_download_desc")}</span>
            </span>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-foreground" aria-hidden />
          </a>}
        </div>
      </div>
    </div>
  );
}
