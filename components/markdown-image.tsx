"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ImageViewer } from "@/components/image-viewer";

/** Expand forge images in the shared reader, from the same authenticated source as their thumbnail. */
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
        className={cn("inline-block max-w-full", canPreview && "cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
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
      {canPreview && <ImageViewer src={props.src as string} alt={alt ?? ""} label={label} open={open} onOpenChange={setOpen} />}
    </>
  );
}
