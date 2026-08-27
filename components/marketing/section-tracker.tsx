import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/** The core tracker, shown as one product screen with its supporting capabilities. */

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
        <header className="mb-10 max-w-2xl sm:mb-12">
          <RevealHeading
            className="max-w-2xl text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("featuresTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mt-3 max-w-xl leading-relaxed text-pretty text-muted-foreground"
          >
            {t("featuresSubtitle")}
          </Reveal>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
          <Reveal as="figure" className="flex flex-col gap-3">
            <ScreenshotSlot id="heroBoard" />
            <figcaption className="text-sm text-muted-foreground">
              {t("featuresCaptionBoard")}
            </figcaption>
          </Reveal>

          <Reveal as="ul" delay={0.1} className="divide-y divide-border border-y border-border">
            {FEATURES.map((feature) => (
              <li key={feature.key} className="flex gap-4 py-5">
                <IsoTile name={feature.icon} className="w-10 shrink-0" />
                <div>
                  <h3 className="font-medium">{t(`feature_${feature.key}_title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t(`feature_${feature.key}_body`)}
                  </p>
                </div>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
