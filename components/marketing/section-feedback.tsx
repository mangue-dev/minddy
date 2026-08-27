import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoNumber } from "./iso-tile";

/**
 * The public feedback board — an entire section, not a grid box.
 *
 * It is BROUGHT, it does not fall: so far everything that enters the
 * tracker comes from the team or its agents, and then the page moves to a
 * public surface for users. The title states that change directly.
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
        <header className="mb-10 max-w-2xl sm:mb-12">
          <RevealHeading
            className="max-w-2xl text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("feedbackTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mt-3 leading-relaxed text-pretty text-muted-foreground"
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

        <Reveal
          as="ol"
          className="mt-12 grid border-y border-border sm:mt-16 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-border"
        >
          {STEPS.map((step, index) => (
            <li key={step} className="py-6 lg:px-6 lg:first:pl-0 lg:last:pr-0">
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
