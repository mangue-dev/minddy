import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §2 — « Et dessous, c'est un vrai tracker ». Ex-`#features`.
 *
 * ELLE RASSURE, ELLE NE CONVAINC PAS (MIN-148). Le hero vend la boucle agent —
 * la seule vraie raison de changer d'outil. Ce qui suit répond à la question
 * qu'on se pose juste après : « oui, mais est-ce que ça tient comme tracker ? »
 * D'où l'ordre (elle vient tout de suite), le format (une capture, six cartes,
 * on ne s'attarde pas) et le titre, qui ne cherche plus à emporter la décision.
 *
 * C'est aussi ici qu'a atterri la capture du board, chassée du hero : un board
 * ressemble forcément à un board, ce qui en fait une mauvaise première image et
 * une bonne preuve de sérieux.
 *
 * La palette ⌘K n'est plus ici : elle ouvre `<SectionSpeed>`, avec sa capture.
 * Ce qui reste est bien le tracker — les écrans où l'on regarde les tickets,
 * pas les gestes pour les manipuler.
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

        {/* Une seule capture depuis que la palette est partie : elle prend donc
            toute la largeur utile plutôt que la moitié d'une grille à deux
            colonnes, où elle serait restée seule à côté d'un vide.

            Le board plutôt que le cycle : c'est l'écran que tout le monde sait
            lire, donc celui qui prouve le plus vite qu'il y a bien un tracker
            là-dessous. Le cycle, lui, est dit par sa carte juste en dessous. */}
        <Reveal as="figure" className="mx-auto mb-12 flex max-w-4xl flex-col gap-3 sm:mb-16">
          <ScreenshotSlot id="heroBoard" />
          <figcaption className="text-center text-sm text-muted-foreground">
            {t("featuresCaptionBoard")}
          </figcaption>
        </Reveal>

        {/* Grille à filets : entrée d'un bloc — masquer les cartes une à une
            découvrirait le fond `bg-border` du conteneur. */}
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
