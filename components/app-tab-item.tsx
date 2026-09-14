"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pin, PinOff, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IssueContextMenu } from "@/components/issue-context-menu";
import type { AppTab } from "@/lib/app-tabs";

export function AppTabItem({ tab, label, icon, active, focusable, busy, last, onActivate, onClose, onPin, onRename, onFocus }: {
  tab: AppTab; label: string; icon: ReactNode; active: boolean; focusable: boolean; busy: boolean; last: boolean;
  onActivate: () => void; onClose: () => void; onPin: () => void; onRename: () => void; onFocus: () => void;
}) {
  const t = useTranslations("AppTabs");
  const ref = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [label, tab.pinned]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return <div role="presentation" className={cn(
    "app-tab group relative flex h-[34px] shrink-0 items-center rounded-md text-sm",
    tab.pinned ? "w-[34px]" : "w-[200px]",
    active
      ? "bg-[var(--app-tab-active-background)] text-sidebar-foreground"
      : "bg-[var(--app-tab-background)] text-muted-foreground hover:brightness-95 dark:hover:brightness-110",
  )}
    onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }); }}>
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <button ref={ref} type="button" role="tab" id={`app-tab-${tab.id}`} data-app-tab-id={tab.id}
          aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight"
          onPointerEnter={() => { const element = labelRef.current; if (element) setTruncated(element.scrollWidth > element.clientWidth); }}
          aria-label={label} aria-selected={active} aria-controls="app-tab-content" tabIndex={focusable ? 0 : -1}
          onFocus={onFocus} onClick={onActivate} aria-disabled={busy || undefined}
          onKeyDown={(event) => {
            if ((event.shiftKey && event.key === "F10") || event.key === "ContextMenu") {
              event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setMenu({ x: box.left, y: box.bottom });
            }
          }}
          className={cn("flex h-full min-w-0 flex-1 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", tab.pinned ? "justify-center" : "pl-2.5 pr-6")}>
          {icon}{!tab.pinned && <span ref={labelRef} className="truncate">{label}</span>}
        </button>
      </TooltipTrigger>
      {(tab.pinned || truncated) && <TooltipContent side="bottom">{label}</TooltipContent>}
    </Tooltip>
    {!tab.pinned && <Tooltip delayDuration={500} disableHoverableContent><TooltipTrigger asChild><button type="button" aria-label={t("closeNamed", { name: label })} disabled={last || busy}
      tabIndex={-1} onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="absolute right-1 flex size-5 items-center justify-center rounded-full opacity-0 hover:bg-background/60 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-0">
      <X className="size-3" aria-hidden />
    </button></TooltipTrigger><TooltipContent side="bottom">{t("close")}</TooltipContent></Tooltip>}
    <IssueContextMenu position={menu} searchable={false} onClose={() => { setMenu(null); ref.current?.focus(); }} actions={[
      { id: "pin", label: t(tab.pinned ? "unpin" : "pin"), icon: tab.pinned ? <PinOff /> : <Pin />, onSelect: onPin, disabled: busy },
      { id: "rename", label: t("rename"), icon: <Pencil />, onSelect: onRename, disabled: busy },
      { id: "close", label: t("close"), icon: <X />, onSelect: onClose, disabled: last || busy, separatorBefore: true },
    ]} />
  </div>;
}
