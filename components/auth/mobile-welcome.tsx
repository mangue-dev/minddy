"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AUTH_SUBMIT_CLASS } from "@/components/auth/auth-chrome";
import { WELCOME_ART } from "@/components/auth/mobile-welcome-art";
import { MinddyLogo } from "@/components/minddy-logo";
import { cn } from "@/lib/utils";

const SLIDES = ["issues", "numo", "agents"] as const;

/**
 * The mobile app's first screen when nobody is signed in (MIN-907): what
 * minddy does, in a few slides, and the way in. Each slide's picture is
 * drawn in code (`mobile-welcome-art.tsx`).
 */
export function MobileWelcome({ onStart }: { onStart: () => void }) {
  const t = useTranslations("MobileWelcome");
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  return (
    <div className="fixed inset-0 z-10 flex touch-none flex-col overflow-hidden bg-background ps-(--safe-inline-start) pe-(--safe-inline-end) pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <MinddyLogo className="mx-auto h-8 shrink-0" />
      <div
        ref={track}
        aria-roledescription="carousel"
        className="mt-2 flex min-h-0 flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none]"
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget;
          setCurrent(Math.round(scrollLeft / Math.max(clientWidth, 1)));
        }}
      >
        {SLIDES.map((slide, index) => {
          const Art = WELCOME_ART[slide];
          return (
            <section
              key={slide}
              aria-roledescription="slide"
              aria-label={t("slideLabel", { current: index + 1, total: SLIDES.length })}
              className="flex w-full shrink-0 snap-center flex-col items-center px-6"
            >
              {/* The picture is decoration: the title and sentence below say
                  what it shows. It sits on the page, its top and bottom
                  fading out, so a scene taller than the room left by the
                  phone dissolves at the edge instead of being cut. */}
              <div
                aria-hidden
                className="flex min-h-0 w-full max-w-[320px] flex-1 overflow-hidden px-1 py-8 [mask-image:linear-gradient(to_bottom,transparent,black_2rem,black_calc(100%-2.5rem),transparent)]"
              >
                <Art />
              </div>
              {/* One height for every slide's text, so the picture above keeps
                  its size from slide to slide. */}
              <div className="mt-2 flex h-40 max-w-[320px] flex-col items-center">
                <h2 className="text-center font-display text-2xl font-semibold tracking-tight text-balance">{t(`${slide}Title`)}</h2>
                <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground text-pretty">{t(`${slide}Body`)}</p>
              </div>
            </section>
          );
        })}
      </div>
      <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
        {SLIDES.map((slide, index) => (
          <span key={slide} className={cn("h-1.5 rounded-full transition-all", index === current ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/25")} />
        ))}
      </div>
      <div className="mx-auto mt-6 w-full max-w-[380px] px-6">
        <Button className={AUTH_SUBMIT_CLASS} onClick={onStart}>
          {t("start")}
        </Button>
      </div>
    </div>
  );
}
