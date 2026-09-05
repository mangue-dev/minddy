"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

/** Frameless lightbox with native focus containment and Escape behavior. */
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
        className="absolute inset-0 cursor-zoom-in rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
      </a>
      <dialog ref={dialog} aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-white outline-none backdrop:bg-black/75 backdrop:backdrop-blur-sm open:flex open:items-center open:justify-center">
        <h2 id={titleId} className="sr-only">{alt}</h2>
        <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)}
          className="fixed top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <X className="size-5" aria-hidden />
        </button>
        {open && <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={dark} />
          {/* Original assets keep small UI text legible in the enlarged preview. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={light} alt={alt} className="h-auto max-h-[calc(100dvh-8rem)] w-auto max-w-[calc(100vw-2rem)] object-contain sm:max-w-[calc(100vw-6rem)]" />
        </picture>}
      </dialog>
    </>
  );
}
