"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home01Icon, Menu01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import Link from "@/components/app-link";
import { MobileNavActions } from "./mobile-nav-actions";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { cn, type NavSection } from "mangue-ui";

export function MobileNavigation({ sections, menuFooter, onSearch }: {
  sections: NavSection[];
  menuFooter: ReactNode;
  onSearch: () => void;
}) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <nav aria-label="Navigation" data-mobile-navigation className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] desktop:hidden">
      <div className="grid h-12 w-[min(100%-2rem,320px)] grid-cols-5 grid-rows-1 items-center rounded-full border border-border bg-background shadow-lg">
        <Link href="/home" aria-label={t("home")} aria-current={pathname === "/home" ? "page" : undefined} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Home01Icon} className="size-[22px]" /></Link>
        <button ref={menuTrigger} data-mobile-menu-trigger type="button" aria-label={t("goTo")} aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Menu01Icon} className="size-[22px]" /></button>
        <button type="button" aria-label={t("searchPlaceholder")} onClick={onSearch} className="flex h-full min-w-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring"><AppIcon icon={Search01Icon} className="size-[22px]" /></button>
        <MobileNavActions />
      </div>
    </nav>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogContent className="mobile-menu-sheet" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuTrigger.current?.focus(); }}>
        <DialogTitle>{t("goTo")}</DialogTitle>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          {sections.map((section, index) => <section key={section.key ?? index}>
            {section.label && <h2 className="mb-1 px-3 text-xs font-medium text-muted-foreground">{section.label}</h2>}
            {section.items.map((item) => {
              const Icon = item.icon;
              const content = <>{Icon && <Icon className="size-5 shrink-0" />}<span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge}</>;
              const className = cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-control-hover", item.active && "bg-control", item.disabled && "opacity-50");
              const onClick = () => { setMenuOpen(false); item.onClick?.(); };
              return item.href && !item.disabled ? <Link key={item.key} href={item.href} className={className} onClick={onClick}>{content}</Link>
                : <button type="button" key={item.key} className={className} onClick={onClick} disabled={item.disabled}>{content}</button>;
            })}
          </section>)}
          {menuFooter}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
