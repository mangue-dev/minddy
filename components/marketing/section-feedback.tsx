import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";

/**
 * Le board de feedback public — une section entière, pas une case de grille.
 *
 * Elle est AMENÉE, elle ne tombe pas : jusqu'ici tout ce qui entre dans le
 * tracker vient de l'équipe ou de ses agents, et on passait sans prévenir à une
 * page publique ouverte à des inconnus. La ligne de bascule (`feedbackLead`)
 * pose ce changement d'origine avant que le titre n'arrive.
 *
 * Deux captures (la page publique, puis la même demande vue côté équipe) parce
 * que la fonctionnalité a deux faces, et quatre temps numérotés pour le trajet
 * d'un retour : posté → filtré → tranché → suivi. Tout ce qui est décrit ici
 * existe : SSO du board, détection des doublons à la publication, modération et
 * catégorisation par Numo avant publication, fusion des votes, réponse d'équipe,
 * promotion en ticket et statut public aligné sur le ticket lié.
 *
 * Le 2ᵉ temps est le filtre, pas les doublons : c'est la question qu'on se pose
 * en ouvrant un board public (« qu'est-ce qui va s'afficher sous mon nom ? »).
 * Le regroupement des doublons y est replié — c'est un des gestes du filtre.
 *
 * Le paragraphe de bas de section (API, saisie pour un utilisateur, prompt
 * d'intégration) est parti avec la passe de resserrage : trois détails
 * d'implémentation qui n'aidaient pas à décider, et qui sont à leur place dans
 * la doc, pas sous quatre cartes qui racontent déjà le trajet complet.
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

        {/* Grille à filets : elle entre d'un bloc, sinon le fond `bg-border`
            apparaîtrait en aplat gris derrière les cartes encore masquées. */}
        <Reveal
          as="ol"
          className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:mt-16 sm:grid-cols-2 lg:grid-cols-4"
        >
          {STEPS.map((step, index) => (
            <li key={step} className="bg-card p-6">
              <span className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/60 font-mono text-sm text-muted-foreground">
                {index + 1}
              </span>
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
