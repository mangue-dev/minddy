import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §2 — “And underneath, it’s a real tracker”. Ex-`#features`.
 *
 * SHE REASSURES, SHE DOES NOT CONVINCE (MIN-148). The hero sells the agent loop —
 * the only real reason to change tools. The following answers the question
 * We then ask ourselves: “yes, but does it work as a tracker? »
 * Hence the order (it comes straight away), the format (one capture, six cards,
 * we don't linger) and the title, which no longer seeks to carry the decision.
 *
 * This is also where the capture of the board landed, chased away from the hero: a board
 * necessarily looks like a board, which makes it a bad first image and
 * a good proof of seriousness.
 *
 * The ⌘K palette is no longer here: it opens `<SectionSpeed>`, with its capture.
 * What remains is the tracker — the screens where we look at the tickets,
 * not the gestures to manipulate them.
 */

const FEATURES = [
  { key: "board", icon: "list" },
  { key: "all", icon: "layers" },
  { key: "inbox", icon: "inbox" },
  { key: "objectives", icon: "objectives" },
  { key: "cycles", icon: "cycles" },
  { key: "triage", icon: "triage" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

export async function SectionTracker() {
  const t = await getTranslations("Landing");

  return (
    <section id="tracker" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("featuresTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("featuresSubtitle")}
          </Reveal>
        </header>

        {/* Only one capture since the palette left: it therefore takes
            the entire useful width rather than half of a two-grid
            columns, where she would have remained alone next to a void.

            The board rather than the cycle: it’s the screen that everyone knows
            read, so the one who proves the fastest that there is indeed a tracker
            below. The cycle is told by its card just below. */}
        <Reveal as="figure" className="mx-auto mb-12 flex max-w-4xl flex-col gap-3 sm:mb-16">
          <ScreenshotSlot id="heroBoard" />
          <figcaption className="text-center text-sm text-muted-foreground">
            {t("featuresCaptionBoard")}
          </figcaption>
        </Reveal>

        {/* Mesh grid: entry to a block — hide cards one by one
            would discover the bottom `bg-border` of the container. */}
        <Reveal
          as="ul"
          className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
        >
          {FEATURES.map((feature) => (
            <li key={feature.key} className="bg-card p-6">
              <IsoTile name={feature.icon} className="mb-4 w-14" />
              <h3 className="mb-1.5 font-medium">{t(`feature_${feature.key}_title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`feature_${feature.key}_body`)}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
