import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoNumber } from "./iso-tile";

/**
 * The public feedback board — an entire section, not a grid box.
 *
 * It is BROUGHT, it does not fall: so far everything that enters the
 * tracker comes from the team or its agents, and we move without warning to a
 * public page open to unknown. The toggle line (`feedbackLead`)
 * sets this original change before the title arrives.
 *
 * Two captures (the public page, then the same request seen on the team side) because
 * the feature has two sides, and four numbered times for the journey
 * of a return: posted → filtered → sliced → followed. Everything described here
 * exists: board SSO, duplicate detection on publication, moderation and
 * categorization by Numo before publication, vote merger, team response,
 * promotion to ticket and public status aligned with the linked ticket.
 *
 * The 2nd step is the filter, not the duplicates: this is the question we ask ourselves
 * when opening a public board (“what will be displayed under my name?”).
 * The grouping of duplicates is folded there — it is one of the gestures of the filter.
 *
 * The paragraph at the bottom of the section (API, input for a user, integration prompt
 *) left with the tightening pass: three implementation details
 * which did not help to decide, and which are in their place in
 * the doc, not under four cards which already tell the journey full.
 */

const STEPS = ["post", "moderate", "decide", "status"] as const;

export async function SectionFeedback() {
  const t = await getTranslations("Landing");

  return (
    <section id="feedback" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <Reveal as="p" className="mb-4 text-sm font-medium text-muted-foreground">
            {t("feedbackLead")}
          </Reveal>
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("feedbackTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("feedbackSubtitle")}
          </Reveal>
        </header>

        <RevealGroup step={0.12} className="grid gap-6 md:grid-cols-2">
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="feedbackBoard" />
            <figcaption className="text-sm text-muted-foreground">
              {t("feedbackCaptionBoard")}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="feedbackInbox" />
            <figcaption className="text-sm text-muted-foreground">
              {t("feedbackCaptionInbox")}
            </figcaption>
          </figure>
        </RevealGroup>

        {/* Mesh grid: it enters in one block, otherwise the background `bg-border`
 would appear in solid gray behind the cards still hidden. */}
        <Reveal
          as="ol"
          className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:mt-16 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STEPS.map((step, index) => (
            <li key={step} className="bg-card p-6">
              {/* The number is LAYERED like the icons in the other sections:
 it is the same drawing, with a glyph instead of a line
 (`isoGlyph`). */}
              <IsoNumber value={String(index + 1)} className="mb-4 w-12" />
              <h3 className="mb-1.5 font-medium">{t(`feedback_${step}_title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`feedback_${step}_body`)}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
