import { getTranslations } from "next-intl/server";
import {
  CalendarRange,
  Command,
  Inbox,
  LayoutList,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * « Ce qu'il y a dedans » (MIN-73). Deux captures pour les écrans qu'on ne
 * devine pas (le cycle, la palette), puis une grille sobre : une ligne par
 * fonctionnalité, aucune promesse qui n'existe pas dans l'app.
 */

const FEATURES: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "board", icon: LayoutList },
  { key: "cycles", icon: CalendarRange },
  { key: "triage", icon: Inbox },
  { key: "palette", icon: Command },
  { key: "feedback", icon: MessagesSquare },
  { key: "numo", icon: Sparkles },
];

export async function SectionFeatures() {
  const t = await getTranslations("Landing");

  return (
    <section id="features" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("featuresTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("featuresSubtitle")}
          </p>
        </header>

        <div className="mb-12 grid gap-6 md:grid-cols-2 sm:mb-16">
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="featureCycle" />
            <figcaption className="text-sm text-muted-foreground">
              {t("featuresCaptionCycle")}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-3">
            <ScreenshotSlot id="featurePalette" />
            <figcaption className="text-sm text-muted-foreground">
              {t("featuresCaptionPalette")}
            </figcaption>
          </figure>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.key} className="bg-card p-6">
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="mb-1.5 font-medium">{t(`feature_${feature.key}_title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`feature_${feature.key}_body`)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
