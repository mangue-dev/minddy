"use client";

import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * One feature card: its icon and title at the top left, an illustration that
 * runs off the card's edges, and a + button that swaps the title for the
 * description. A click anywhere on the card does the same. The description
 * sits on a fade of the card's own color (`--point-card`, see `SOFT_TONES`), so
 * where it runs over the illustration it stays readable. It stays in the
 * page for search engines and screen readers while it is hidden.
 */
export function PointCard({
  icon,
  title,
  body,
  tone,
  anchor,
  showLabel,
  hideLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  /** Background classes, from `SOFT_TONES`. */
  tone: string;
  anchor?: string;
  showLabel: string;
  hideLabel: string;
  /** The illustration, placed by the card. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  // A link inside the illustration (the repository) keeps its own click.
  const toggleFromCard = (event: MouseEvent<HTMLLIElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    setOpen((value) => !value);
  };

  return (
    <li
      id={anchor}
      onClick={toggleFromCard}
      className={cn("relative h-72 cursor-pointer scroll-mt-24 overflow-hidden rounded-2xl select-none", tone)}
    >
      <div className="absolute inset-0 top-[5.5rem] left-8">{children}</div>

      <div className="relative flex items-start gap-3 p-5">
        {/* The title leaves upward as the description comes up into its place. */}
        <motion.h3
          initial={false}
          animate={open ? { opacity: 0, y: -12 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1], delay: open ? 0 : 0.08 }}
          className="flex min-h-8 flex-1 items-center gap-2 text-base font-medium tracking-tight"
        >
          {icon}
          {title}
        </motion.h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? hideLabel : showLabel}
          onClick={() => setOpen((value) => !value)}
          className="relative z-20 -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <HugeiconsIcon
            icon={Add01Icon}
            className={cn("size-4 transition-transform duration-200", open && "rotate-45")}
            aria-hidden
          />
        </button>
      </div>

      {/* The description, on the card's color fading out 2rem under its last line. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1], delay: 0.08 } }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
            className="absolute inset-x-0 top-0 z-10 p-5 pr-14 pb-10 [background:linear-gradient(to_bottom,var(--point-card)_calc(100%-2.5rem),transparent)]"
          >
            <p id={bodyId} className="text-sm leading-relaxed text-pretty">
              {body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {!open && (
        <p id={bodyId} className="sr-only">
          {body}
        </p>
      )}
    </li>
  );
}
