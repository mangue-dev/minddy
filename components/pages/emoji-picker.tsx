"use client";

// The one-page emoji picker (MIN-270).
//
// `frimousse` rather than a grid written here: a real selector is the
// multilingual search, color variants, 1800 virtualization
// emojis and fallback on what the browser knows how to DISPLAY. None of this
// can't be DIYed in an afternoon, and the DIY version we would keep
// would show empty squares on half of the systems.
//
// The library is without style, Radix style: it’s us who paint, so
// the selector remains in the grammar of the app rather than placing a widget there
// from elsewhere.

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmojiPicker as Frimousse } from "frimousse";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";

export function EmojiPicker({
  value,
  onChange,
  className,
  children,
}: {
  value: string | null;
  /** `null` removes the icon — the page then shows NONE (page-header.tsx). */
  onChange: (emoji: string | null) => void;
  className?: string;
  /**
 * The trigger. Absent: a button that shows the current emoji — only take it when there is one. Without an icon, it is up to the caller to provide
 * its own trigger: a 📄 automatically reads like a chosen icon
 *, and hides that one can be chosen.
 */
  children?: React.ReactNode;
}) {
  const t = useTranslations("Pages");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            aria-label={t("changeIcon")}
            className={cn("size-12 shrink-0 p-0 text-4xl leading-none", className)}
          >
            {value}
          </Button>
        )}
      </PopoverTrigger>
      {/* `overflow-hidden`: the selector paints its own background over its entire
 height (search bar, virtualized list). Without cutting, its
 square corners cover those of the panel and the whole thing appears without radius
 — the radius is there, it is the content which passes over it. */}
      <PopoverContent
        align="start"
        className="w-[320px] overflow-hidden p-0"
      >
        <Frimousse.Root
          // The language of the app controls that of the search: search
          // “fuze” must find 🚀 in French like “rocket” in English.
          locale={locale === "fr" ? "fr" : "en"}
          className="isolate flex h-[340px] w-full flex-col bg-popover"
          onEmojiSelect={({ emoji }) => {
            onChange(emoji);
            setOpen(false);
          }}
        >
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Frimousse.Search
              placeholder={t("searchEmoji")}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {value ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {t("removeIcon")}
              </Button>
            ) : null}
          </div>
          <Frimousse.Viewport className="scrollbar-quiet relative flex-1 outline-none">
            <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {t("loadingEmoji")}
            </Frimousse.Loading>
            <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {t("noEmoji")}
            </Frimousse.Empty>
            <Frimousse.List
              className="select-none pb-1"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1 px-1" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </Frimousse.Viewport>
        </Frimousse.Root>
      </PopoverContent>
    </Popover>
  );
}
