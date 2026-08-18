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
    // `mt-auto` glue it to the bottom of the row, which is the bottom of the page: the
    // row is worth `1fr` whatever she wears, so putting the trick here doesn't move
    // not compose it remained in the exact center of the window.
    <p className="mt-auto flex min-h-5 flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-8 text-xs text-muted-foreground">
      {tip && (
        <>
          <Lightbulb className="size-3.5 shrink-0" aria-hidden />
          <span className="text-balance">{t(tip.key)}</span>
          {shortcut && (
            <KbdSequence
              keys={shortcut.keys.map((step) => step.map(resolveKeyToken))}
              size="sm"
              separator={tk("then")}
            />
          )}
        </>
      )}
    </p>
  );
}
