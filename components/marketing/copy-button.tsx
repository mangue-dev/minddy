"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";

/**
 * “Copy” button of a public site configuration block (MIN-93).
 *
 * The labels arrive in PROPS, translated on the server side, and not by a
 * `useTranslations`: a namespace read from a client component of the site public
 * must be appended to `PUBLIC_CLIENT_NAMESPACES`, which serializes it into the
 * public SIX page document — including landing, whose byte budget
 * is the entire subject of MIN-100. Two chains in props cost two chains.
 *
 * Visual feedback on the spot rather than a toast: the `Toaster` is already loaded
 * lazily for the app, and opening a notification at the bottom of the screen for a
 * button that we look at is a return trip of the eye for nothing.
 */
export function CopyButton({
  text,
  label,
  copiedLabel,
  iconOnly = false,
  className,
  onClick,
  ...rest
}: {
  /** What goes to the clipboard. */
  text: string;
  label: string;
  copiedLabel: string;
  /**
 * Icon alone, without frame: the label becomes the accessible name of the button au
 * instead of being written next to it. For places where the button lands AGAINST the
 * value it copies — the contact address of the footer — and where a lined
 * button would steal the show from the text it accompanies.
 */
  iconOnly?: boolean;
  className?: string;
  // The rest goes to the `<button>`, including `ref`: this is what allows you to
  // wrap it in a `TooltipTrigger asChild`, which passes its headphones to it
  // and its `aria-describedby`.
} & ComponentProps<"button">) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  // The component can disappear during the two seconds of display.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Some embedded browsers deny the modern clipboard permission even for
      // a direct click. Keep the button useful there without retaining the text
      // in the document after the copy attempt.
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (!copied) return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      // The label changes to “copied”: read next to the icon, or announced by the
      // name accessible when there is only the icon. The return is the same in
      // deux cas, il change juste de canal.
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      {...rest}
      // The caller's click first — that of a `TooltipTrigger` closes
      // the tooltip, and overwriting it would leave it open on the clicked button.
      onClick={(event) => {
        onClick?.(event);
        void copy();
      }}
      className={cn(
        "inline-flex shrink-0 items-center transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        iconOnly
          ? "rounded-md p-1 text-muted-foreground"
          : "gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
      {!iconOnly && (copied ? copiedLabel : label)}
    </button>
  );
}
