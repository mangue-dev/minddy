"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

/** Native modal preview keeps the full image, focus containment, and Escape behavior. */
export function ScreenshotPreview({
  light, dark, alt, expandLabel, closeLabel,
}: {
  light: string;
  dark: string;
  alt: string;
  expandLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    const previousOverflow = document.body.style.overflow;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      modal?.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <a ref={trigger} href={light} target="_blank" rel="noreferrer"
        aria-label={`${expandLabel}: ${alt}`}
        onClick={event => { event.preventDefault(); setOpen(true); }}
        className="group absolute inset-0 cursor-zoom-in rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
        <span className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
          <Maximize2 className="size-4" aria-hidden />
        </span>
      </a>
      <dialog ref={dialog} aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
        className="fixed m-auto max-h-[94dvh] w-[96vw] max-w-[1600px] overflow-visible rounded-xl border border-border bg-background p-3 pt-16 text-foreground shadow-xl backdrop:bg-black/65 backdrop:backdrop-blur-sm sm:p-5 sm:pt-16">
        <h2 id={titleId} className="sr-only">{alt}</h2>
        <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)}
          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <X className="size-5" aria-hidden />
        </button>
        {open && <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={dark} />
          {/* Original assets keep small UI text legible in the enlarged preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={light} alt={alt} className="max-h-[calc(94dvh-5.5rem)] w-full object-contain" />
        </picture>}
      </dialog>
    </>
  );
}
