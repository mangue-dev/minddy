"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IMAGE_HERO_TRANSITION, ImageViewer } from "@/components/image-viewer";

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
  // The opened image flies from its place in the text and back, like an image
  // in the notebook or a page.
  const heroId = useId();
  const reducedMotion = useReducedMotion();
  const layoutId = canPreview && !reducedMotion ? `markdown-image-${heroId}` : undefined;

  return (
    <LayoutGroup id={heroId}>
      <motion.img
        {...(props as Omit<ComponentPropsWithoutRef<typeof motion.img>, "alt">)}
        layoutId={layoutId}
        layoutDependency={open}
        animate={{ opacity: open ? 0 : 1 }}
        transition={{ ...IMAGE_HERO_TRANSITION, opacity: { duration: reducedMotion ? 0 : 0.12 } }}
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
      {canPreview && (
        <ImageViewer src={props.src as string} alt={alt ?? ""} label={label} open={open} onOpenChange={setOpen} layoutId={layoutId} />
      )}
    </LayoutGroup>
  );
}
