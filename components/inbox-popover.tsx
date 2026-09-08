"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Popover, PopoverAnchor, PopoverContent, Skeleton } from "mangue-ui";
import { OPEN_INBOX_EVENT } from "@/lib/inbox-launcher";

const InboxContent = dynamic(() => import("@/components/inbox-content"), {
  loading: () => <Skeleton className="m-3 h-64" />,
});

function visibleTrigger() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-inbox-trigger]"))
    .find((element) => element.getBoundingClientRect().width > 0);
}

export function InboxPopover({ open, onOpenChange: setOpen }: {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Inbox");
  const returnFocus = useRef<HTMLElement | null>(null);
  const anchor = useRef({
    getBoundingClientRect: () => visibleTrigger()?.getBoundingClientRect()
      ?? new DOMRect(window.innerWidth / 2, window.innerHeight - 72, 0, 0),
  });

  useEffect(() => {
    const launch = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen((current) => !current);
    };
    window.addEventListener(OPEN_INBOX_EVENT, launch);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, launch);
  }, [setOpen]);

  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  useEffect(() => {
    if (searchParams.get("inbox") !== "1") return;
    setOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("inbox");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams, setOpen]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        id="inbox-popover"
        aria-label={t("title")}
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        updatePositionStrategy="always"
        className="h-[min(600px,calc(100dvh-96px))] max-h-[var(--radix-popover-content-available-height)] w-[480px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest("[data-inbox-trigger]")) {
            event.preventDefault();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current;
          if (target?.isConnected) target.focus();
          else visibleTrigger()?.focus();
        }}
      >
        <InboxContent onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
