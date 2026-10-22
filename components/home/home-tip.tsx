"use client";

// The tip at the bottom of the home page (MIN — “Home page”), like Cursor: one line
// discreet, at the bottom, which learns a gesture from the application.
//
// The pool and the rule that holds it are in lib/home-tips.ts; this file does not
// only handles rendering.
//
// Two points are worth saying here:
//
// 1. **The seed only arises at the assembly**, as for righteous salvation
// above (see useGreeting in app/(app)/home/page.tsx): a draw
// server rendering would give a different tip on either side of
// hydration. The keys depend on the platform
// (`resolveKeyToken` reads `navigator`) and have the same constraint.
// 2. **The paragraph is rendered anyway**, empty while waiting for the seed.
// It therefore occupies its line from the first painting, and the trick that arrives does not
// pushes no other content down.

import { HugeiconsIcon } from "@hugeicons/react";
import { BulbIcon } from "@hugeicons/core-free-icons";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { KbdSequence } from "@/components/ui/kbd";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import { pickTip, tipShortcut } from "@/lib/home-tips";

export function HomeTip() {
  const t = useTranslations("Home.tips");
  const tk = useTranslations("Keyboard");
  const [seed, setSeed] = useState<number | null>(null);

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const tip = seed === null ? null : pickTip(seed);
  const shortcut = tip ? tipShortcut(tip) : undefined;
  const textRef = useShrinkWrap(tip?.key);

  return (
    // Full row width, `mt-auto` glues it to the foot of the page; the container
    // itself is content-sized and centered.
    <p data-home-tip className="mt-auto hidden justify-center pt-8 text-xs text-muted-foreground app-desktop:flex">
      {tip && (
        /* Its own container: content width bounded by the hint's max width,
           centered on the WHOLE row (mx-auto + w-fit) — the text keeps
           its natural left alignment inside the container. */
        <span className="mx-auto flex w-fit max-w-[36rem] items-center gap-x-2">
          <HugeiconsIcon icon={BulbIcon} className="size-3.5 shrink-0" aria-hidden />
          <span ref={textRef} className="text-balance">
            {t(tip.key)}
            {shortcut && (
              <>
                {" "}
                <KbdSequence
                  keys={shortcut.keys.map((step) => step.map(resolveKeyToken))}
                  size="sm"
                  separator={tk("then")}
                />
              </>
            )}
          </span>
        </span>
      )}
    </p>
  );
}

/**
 * Narrow a wrapped text box to its widest line.
 *
 * A box whose text wraps keeps the width it was offered, not the width of its
 * lines — and `text-balance` shortens the lines further. The hint then sat
 * left of center on two lines, its box centered but its text not. Measuring
 * the rendered lines and pinning the width makes the box hug the text, so
 * centering the box centers what is read.
 */
function useShrinkWrap(key: string | undefined) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.width = "";
      const range = document.createRange();
      range.selectNodeContents(el);
      const left = el.getBoundingClientRect().left;
      let right = left;
      for (const rect of range.getClientRects()) right = Math.max(right, rect.right);
      const width = Math.ceil(right - left);
      if (width > 0) el.style.width = `${width}px`;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    // The row (window resizes) and the text itself: the shortcut keys render
    // a moment after the words, and their arrival can rewrap the lines.
    const observer = new ResizeObserver(fit);
    const row = el.parentElement?.parentElement;
    if (row) observer.observe(row);
    observer.observe(el);
    return () => observer.disconnect();
  }, [key]);
  return ref;
}
