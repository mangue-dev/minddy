import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { Button } from "mangue-ui/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { AgentLoopFigure } from "./agent-loop-figure";
import { TrackedCta } from "./tracked-cta";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

/**
 * The opening promise and its proof. Cloud is the primary action; the public
 * repository is the adjacent trust path, not a footnote near the end of the page.
 * The shader remains at page level so it can extend behind the navigation.
 */

/**
 * Split a title fragment into animated words while keeping one continuous
 * animation sequence across the regular and italic fragments.
 */
function HeroWords({
  text,
  start,
  className,
}: {
  text: string;
  start: number;
  className?: string;
}) {
  let i = start;

  return (
    <>
      {text.split(/(\s+)/).map((token, index) => {
        if (token === "") return null;
        if (/^\s+$/.test(token)) return token;
        const delayIndex = i;
        i += 1;
        return (
          <span
            key={index}
            className={className ? `hero-word ${className}` : "hero-word"}
            style={{ "--hero-i": delayIndex } as CSSProperties}
          >
            {token}
          </span>
        );
      })}
    </>
  );
}

/** Number of words in a fragment — used to chain the indexes of the cascade. */
function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function Hero() {
  const t = await getTranslations("Landing");

  const titleBefore = t("heroTitleBefore");
  const titleAccent = t("heroTitleAccent");
  // The title is the LCP element, so it starts immediately.
  const accentStart = wordCount(titleBefore);
  const afterTitle = 0.06 * (accentStart + wordCount(titleAccent)) + 0.18;

  return (
    <section className="pt-8 pb-16 sm:pt-12 sm:pb-24">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 pt-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:pt-14">
          <div className="max-w-2xl">
          <h1
            className="text-4xl leading-[1.02] font-semibold tracking-tighter text-balance sm:text-6xl lg:text-[4.25rem]"
            aria-label={`${titleBefore} ${titleAccent}`}
          >
            <span aria-hidden="true">
              <HeroWords text={titleBefore} start={0} />{" "}
              <HeroWords
                text={titleAccent}
                start={accentStart}
                className="font-serif font-normal italic"
              />
            </span>
          </h1>

          <p
            style={{ "--hero-d": afterTitle } as CSSProperties}
            className="hero-reveal mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("heroSubtitle")}
          </p>

          <div
            style={{ "--hero-d": afterTitle + 0.12 } as CSSProperties}
            className="hero-reveal mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
          >
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="hero">
                {t("heroCtaPrimary")}
              </TrackedCta>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <Github data-icon="inline-start" />
                {t("heroCtaSecondary")}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
          </div>

          <p
            style={{ "--hero-d": afterTitle + 0.22 } as CSSProperties}
            className="hero-reveal mt-4 text-sm text-muted-foreground"
          >
            {t("heroNote")}
          </p>
          </div>

          {/* The figure has no delayed reveal because it is visible in the first
              viewport and should remain useful when animation is disabled. */}
          <div className="hero-reveal hero-reveal-media lg:pt-4">
            <AgentLoopFigure />
          </div>
        </div>
      </div>
    </section>
  );
}
