import type { CSSProperties } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { AgentLoopFigure } from "./agent-loop-figure";
import { TrackedCta } from "./tracked-cta";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Hero of the landing (MIN-73). Promise in one sentence, two actions, one image.
 * The accented word changes to Instrument Serif italic — the same breath
 * typographical than the rest of the brand.
 *
 * WHAT HE PROMISES (MIN-148). The title bore the tracker (“A complete tracker,
 * and yet obvious") and the image showed a board: the first two screens
 * placed us on the Linear field, where a board necessarily looks like a
 * board. It now wears the buckle — you write the ticket, the agent takes
 * the rest — and the image shows it (`agent-loop-figure.tsx`). The tracker does not have
 * disappeared: it passed just below, in reinsurance (`section-tracker.tsx`).
 *
 * The shader is NOT rendered here: it is placed at page level to leave
 * from the top of the document and go behind the navbar (see `hero-shader.tsx`).
 *
 * Entrance animation: the title is revealed word for word then the rest continues in
 * cascade. Unlike the sections below, nothing is triggered by scrolling
 * — the hero is already on the screen when the page arrives, waiting for him would cost
 * hydration time for nothing. Everything is therefore CSS played from the first
 * rendered, without a line of JavaScript (see `app/globals.css`).
 */

/**
 * Cut a title fragment into animated words, continuing the numbering
 * of the previous fragment (`start`) so that the cascade crosses the passage in
 * italics without starting from scratch.
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
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  const href = (path: string) => localizedHref(path, locale as Locale);

  const titleBefore = t("heroTitleBefore");
  const titleAccent = t("heroTitleAccent");
  // The title starts at 0 s: it is the LCP element, any delay on it is a delay
  // on the metric. The rest is spread out behind its last syllable.
  const accentStart = wordCount(titleBefore);
  const afterTitle = 0.06 * (accentStart + wordCount(titleAccent)) + 0.18;

  return (
    <section className="pt-10 pb-16 sm:pb-24">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl pt-10 text-center sm:pt-16">
          {/* The “MCP Server included in the free plan” badge has been removed:
              he announced an offer detail above a title that the
              visitor has not yet read, and pushed the `<h1>` — the LCP element
              — one line down. The subject is treated where it arises:
              the Agents section, the `/mcp` page and the pricing table. */}
          <h1
            className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-6xl"
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
            className="hero-reveal mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("heroSubtitle")}
          </p>

          <div
            style={{ "--hero-d": afterTitle + 0.12 } as CSSProperties}
            className="hero-reveal mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            {/* THE FIRST ACTION IS DOWNLOAD (MIN-292).

                It took the place of “Start Free”, and what
                made this choice impossible was lifted at the same time: the app
                opened on the LOGIN screen, so download without account
                led into the wall. It now opens for registration
                (`login-form.tsx`), and the gesture ends where it promised
                d'aller.

                It targets the PAGE and not `/api/desktop/download`: release 120 MB
                on the click of someone who has just read a title would be
                brutal, and the page says what the button cannot say — the
                Intel chip, system requirements, and notifications that
                stop when you exit the app. */}
            <Button asChild size="lg">
              <a href={href("/download")}>
                <Download data-icon="inline-start" />
                {t("heroCtaDownload")}
              </a>
            </Button>
            {/* The secondary action no longer targets /pricing: request the price from
                someone who has just read the title arrives too early, and the note
                just below already answers (“free up to 2 projects”).
                It sends the ticket → pull request route, the question
                that we really ask ourselves at this moment.

                And she is no longer `TrackedCta`: `landing_cta_clicked` counts
                entries to REGISTRATION, but it became a scroll
                in the page. Leaving him there would inflate “hero” with people who
                just wanted to read more. */}
            <Button asChild size="lg" variant="outline">
              <a href={href("/#workflow")}>{t("heroCtaSecondary")}</a>
            </Button>
          </div>

          {/* The offer note, and the entry by the BROWSER — who exchanged his
              place with the download (MIN-292).

              It goes down from one button to one note, but it doesn't DISAPPEAR, and
              that's what matters: the landing is seen from Windows, Linux and
              phones, where the top button leads nowhere. She
              there also remains a full button in the navigation bar,
              the screen permanently.

              She keeps her `TrackedCta`: `landing_cta_clicked` counts the
              entries to REGISTRATION, and this is one — move it
              without the tracker would have dropped “hero” to zero in the
              statistics without any visitor having changed their behavior. */}
          <p
            style={{ "--hero-d": afterTitle + 0.22 } as CSSProperties}
            className="hero-reveal mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          >
            <span>{t("heroNote")}</span>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <TrackedCta
              href="/signup"
              location="hero"
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("heroNoteSignup")}
            </TrackedCta>
          </p>
        </div>

        {/* WITHOUT DELAY, unlike the rest of the waterfall (MIN-88). It was
            a capture, therefore the second LCP candidate: measured, its place at the end of
            cascade (≈ 0.95 s wait) weighed ~1.2 s render delay. There
            figure is no longer an image and the title remains the only candidate
            serious, but we keep the start at 0 s and the opacity floor of
            `hero-reveal-media`: nothing to be gained by delaying what is already
            free, and the title remains eligible from the first frame. */}
        <div className="hero-reveal hero-reveal-media mt-14 sm:mt-20">
          <AgentLoopFigure />
        </div>
      </div>
    </section>
  );
}
