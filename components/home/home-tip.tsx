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
//     pousse rien.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
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

  return (
    // Full row width, `mt-auto` glues it to the foot of the page; the container
    // itself is content-sized and centered.
    <p className="mt-auto flex justify-center pt-8 text-xs text-muted-foreground">
      {tip && (
        /* Its own container: content width bounded by the hint's max width,
           centered on the WHOLE row (mx-auto + w-fit) — the text keeps
           its natural left alignment inside the container. */
        <span className="mx-auto flex w-fit max-w-[36rem] items-center gap-x-2">
          <Lightbulb
            className="size-3.5 shrink-0"
            aria-hidden
          />
          <span className="text-balance">
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
