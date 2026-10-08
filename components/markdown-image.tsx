"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Expand forge images using the same authenticated source as their thumbnail. */
export function MarkdownImage({
  previewable,
  className,
  alt,
  ...props
}: ComponentPropsWithoutRef<"img"> & { previewable: boolean }) {
  const t = useTranslations("Resources");
  const [open, setOpen] = useState(false);
  const canPreview = previewable && typeof props.src === "string" && !!props.src;
  const label = alt || t("preview");

  return (
    <>
      <img
        {...props}
        alt={alt ?? ""}
        loading="lazy"
        className={cn("inline-block max-w-full rounded-md", canPreview && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        aria-label={canPreview ? `${t("preview")}: ${label}` : undefined}
        onClick={canPreview ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        } : undefined}
        onKeyDown={canPreview ? (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        } : undefined}
      />
      {canPreview && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent aria-describedby={undefined} className="dialog-pane-mirror flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 -translate-x-0 -translate-y-0 rounded-(--app-pane-radius) sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]">
            <div className="flex h-16 shrink-0 items-center border-b border-border px-5 pr-14">
              <DialogTitle className="truncate text-sm font-medium">{label}</DialogTitle>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
              {open && <img src={props.src} alt={alt ?? ""} className="h-full w-full object-contain p-4" />}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
