"use client";

// A resource as a card (MIN-742), the way Finder shows a file in icon view:
// no background, a figure (the image itself when it is one, otherwise a tile
// with the file type's colored icon), the name on two lines with its
// extension always whole, and the size in blue.
//
// Every card has the same width and figure height, so a row of mixed
// resources stays aligned whatever the images' proportions.

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppTooltip } from "@/components/ui/app-tooltip";
import Link from "@/components/app-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { middleTruncate, middleTruncateByLength, splitExtension } from "@/lib/middle-truncate";

/** The card's width and figure height, fixed whatever the resource. */
export const RESOURCE_CARD_WIDTH = "w-[104px]";
const FIGURE_HEIGHT = "h-[72px]";

/** Characters kept on the first render, before the name can be measured. */
const FIRST_RENDER_CHARS = 26;

let canvas: HTMLCanvasElement | null = null;

/**
 * The name as it fits two lines of `element`, measured with its own font;
 * `null` when the browser cannot measure (tests, server render).
 */
function measuredName(name: string, element: HTMLElement): string | null {
  const width = element.clientWidth;
  if (width <= 0) return null;
  canvas ??= document.createElement("canvas");
  const context = canvas.getContext?.("2d");
  if (!context) return null;
  const style = getComputedStyle(element);
  context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const widths = new Map<string, number>();
  const charWidth = (char: string) => {
    let w = widths.get(char);
    if (w === undefined) {
      w = context.measureText(char).width;
      widths.set(char, w);
    }
    return w;
  };
  // One pixel of slack per line: per-character widths ignore kerning.
  return middleTruncate(name, { width: width - 1, lines: 2, charWidth });
}

/** The two-line name; the full name in a tooltip when it had to be cut. */
function CardName({ name, struck }: { name: string; struck?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(() => middleTruncateByLength(name, FIRST_RENDER_CHARS));
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setShown(measuredName(name, element) ?? middleTruncateByLength(name, FIRST_RENDER_CHARS));
  }, [name]);

  const label = (
    <span
      ref={ref}
      // `break-all` is what the measurement assumes; the clamp only guards
      // against a font that loads after it.
      className={cn(
        "line-clamp-2 w-full break-all text-center text-xs leading-4 font-medium text-foreground",
        struck && "text-muted-foreground line-through",
      )}
    >
      {shown}
    </span>
  );
  if (shown === name) return label;
  // Below the name: above it, the bubble would cover the figure and catch
  // the click meant for the card.
  return <AppTooltip label={name} side="bottom">{label}</AppTooltip>;
}

/** The image itself, contained in the figure box without moving the rest. */
export function ResourceThumbnail({
  src,
  fallback,
}: {
  src: string;
  /** Shown instead when the image cannot be loaded. */
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // A private attachment served by the authenticated proxy: next/image
    // would fetch it without the session.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="max-h-full max-w-full rounded-[3px] object-contain shadow-xs ring-1 ring-border"
    />
  );
}

/**
 * The generic tile: the type's colored icon over its extension, like a
 * document icon. `label` is the extension, or a word for links and pages.
 */
export function ResourceTile({ icon, label }: { icon: ReactNode; label?: string | null }) {
  return (
    <span className="flex h-full w-[56px] flex-col items-center justify-center gap-1 rounded-[10px] bg-muted ring-1 ring-border">
      {icon}
      {label && (
        <span className="max-w-full truncate px-1 text-[10px] leading-none font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      )}
    </span>
  );
}

/** The extension a tile prints, without its dot: `pdf`, `webp`. */
export function tileExtension(name: string): string | null {
  const extension = splitExtension(name)[1].slice(1);
  return extension || null;
}

/**
 * One entry of a card's menu. An `href` renders a real anchor (a download, a
 * link opened beside the app, or in-app navigation with `internal`), so
 * modified clicks keep working; otherwise `onSelect` runs.
 */
export interface ResourceCardItem {
  key: string;
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onSelect?: () => void;
  href?: string;
  /** Opens in a new tab. */
  external?: boolean;
  /** Downloads rather than navigates. */
  download?: boolean;
  /** Navigates inside the app. */
  internal?: boolean;
}

/**
 * The card. A click or a right-click opens its menu (MIN-742): open,
 * rename, download, remove — whichever apply. A card with no entry (a
 * trashed page) is inert.
 */
export function ResourceCard({
  name,
  detail,
  figure,
  items,
  menuLabel,
  struck = false,
  busy = false,
  className,
}: {
  name: string;
  /** The size of a file, the host of a link, "Page" for a page. In blue. */
  detail?: string | null;
  /** The thumbnail or the tile. */
  figure: ReactNode;
  items: ResourceCardItem[];
  /** The menu's accessible name. */
  menuLabel: string;
  /** A trashed page: still readable, not openable. */
  struck?: boolean;
  /** An upload in flight. */
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Closed by a click elsewhere (often another card's right-click): handing
  // focus back to this card would close the menu that click just opened.
  const closedOutside = useRef(false);
  const body = (
    <>
      <span className={cn("flex w-full items-center justify-center", FIGURE_HEIGHT)}>{figure}</span>
      <CardName name={name} struck={struck} />
      {detail && (
        <span className={cn("text-[11px] leading-4", busy ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400")}>
          {detail}
        </span>
      )}
    </>
  );
  const shape = cn(
    "flex w-full flex-col items-center gap-1 rounded-lg p-1 text-left outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring/50",
  );
  const frame = cn("relative shrink-0", RESOURCE_CARD_WIDTH, busy && "opacity-70", className);

  if (items.length === 0) {
    return (
      <div className={frame} data-slot="resource-card">
        <span className={shape}>{body}</span>
      </div>
    );
  }

  return (
    <div className={frame} data-slot="resource-card">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${menuLabel}: ${name}`}
            // A right-click opens the same menu, not the browser's.
            onContextMenu={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className={cn(shape, "cursor-pointer data-[state=open]:bg-accent/60")}
          >
            {body}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-44"
          aria-label={menuLabel}
          onInteractOutside={() => {
            closedOutside.current = true;
          }}
          onCloseAutoFocus={(event) => {
            if (!closedOutside.current) return;
            closedOutside.current = false;
            event.preventDefault();
          }}
        >
          {items.map((item, index) => {
            // Remove stands apart from what only opens or changes the file.
            const separated = item.destructive && index > 0 && !items[index - 1].destructive;
            const content = (
              <>
                {item.icon}
                <span>{item.label}</span>
              </>
            );
            const variant = item.destructive ? "destructive" : "default";
            const entry = (() => {
            if (item.href && item.internal) {
              return (
                <DropdownMenuItem variant={variant} asChild>
                  <Link href={item.href}>{content}</Link>
                </DropdownMenuItem>
              );
            }
            if (item.href) {
              return (
                <DropdownMenuItem variant={variant} asChild>
                  <a
                    href={item.href}
                    {...(item.download ? { download: name } : {})}
                    {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {content}
                  </a>
                </DropdownMenuItem>
              );
            }
            return (
              <DropdownMenuItem variant={variant} onSelect={() => item.onSelect?.()}>
                {content}
              </DropdownMenuItem>
            );
            })();
            return (
              <Fragment key={item.key}>
                {separated && <DropdownMenuSeparator />}
                {entry}
              </Fragment>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
