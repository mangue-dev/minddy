import { getTranslations } from "next-intl/server";
import {
  CalendarRange,
  Inbox,
  Layers,
  LayoutList,
  ListFilter,
  Target,
  type LucideIcon,
} from "lucide-react";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";

/**
 * §2 — « Le tracker ». Ex-`#features`, remontée juste après le hero.
 *
 * C'était la dernière section de contenu : la page traversait quatre sections
 * d'IA avant de montrer le produit, et le titre « Tout ce qu'il faut. Rien de
 * plus. » arrivait après six sections qui le contredisaient. En position 2 il
 * ouvre au lieu de conclure — le titre n'a pas eu besoin d'être réécrit, juste
 * déplacé.
 *
 * La palette ⌘K n'est plus ici : elle ouvre `<SectionSpeed>`, avec sa capture.
 * Ce qui reste est bien le tracker — les écrans où l'on regarde les tickets,
 * pas les gestes pour les manipuler.
 */

const FEATURES: ReadonlyArray<{ key: string; icon: LucideIcon }> = [
  { key: "board", icon: LayoutList },
  { key: "all", icon: Layers },
  { key: "inbox", icon: Inbox },
  { key: "objectives", icon: Target },
  { key: "cycles", icon: CalendarRange },
  { key: "triage", icon: ListFilter },
];

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

        {/* Une seule capture depuis que la palette est partie : elle prend donc
            toute la largeur utile plutôt que la moitié d'une grille à deux
            colonnes, où elle serait restée seule à côté d'un vide. */}
        <Reveal as="figure" className="mx-auto mb-12 flex max-w-4xl flex-col gap-3 sm:mb-16">
          <ScreenshotSlot id="featureCycle" />
          <figcaption className="text-center text-sm text-muted-foreground">
            {t("featuresCaptionCycle")}
          </figcaption>
        </Reveal>

        {/* Grille à filets : entrée d'un bloc — masquer les cartes une à une
            découvrirait le fond `bg-border` du conteneur. */}
        <Reveal
          as="ul"
          className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
        >
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
        </Reveal>
      </div>
    </section>
  );
}
