"use client";

import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useId, useState } from "react";
import { IMAGE_HERO_TRANSITION, ImageViewer } from "@/components/image-viewer";

export function DocumentationImage({ src, alt, width, height, caption, openLabel }: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
  openLabel: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const layoutId = `documentation-image-${id}`;

  return <LayoutGroup id={id}>
    <span className="my-5 block">
      <button type="button" aria-label={alt ? `${openLabel}: ${alt}` : openLabel} aria-haspopup="dialog"
        className="block max-w-full cursor-zoom-in rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        onClick={() => setOpen(true)}>
        <motion.span layoutId={reducedMotion ? undefined : layoutId}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ ...IMAGE_HERO_TRANSITION, opacity: { duration: reducedMotion ? 0 : 0.12 } }}
          className="block overflow-hidden rounded-lg border border-border">
          <img src={src} alt={alt} loading="lazy" width={width} height={height} className="h-auto max-w-full" />
        </motion.span>
      </button>
      {caption && <span className="mt-2 block text-sm text-muted-foreground">{caption}</span>}
    </span>
    <ImageViewer src={src} alt={alt} label={alt || openLabel} open={open} onOpenChange={setOpen} layoutId={layoutId} />
  </LayoutGroup>;
}
