import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { CtaShader } from "./hero-shader";
import { TrackedCta } from "./tracked-cta";
import { Reveal, RevealHeading } from "./reveal";

/**
 * Dernière relance avant le footer (MIN-73). Partagée par la landing et la page
 * tarifs : les deux se terminent sur la même demande, il n'y a pas de raison
 * qu'elles ne se terminent pas sur le même écran.
 *
 * Un écran, justement : la section occupe presque toute la hauteur du viewport
 * et centre son contenu, avec le fond animé du hero derrière. C'est le seul
 * moment de la page, avec le hero, où on ne demande pas de lire mais de cliquer.
 *
 * `relative isolate` : le shader est un enfant en `-z-10`, il doit rester
 * derrière le texte de la section sans passer derrière le fond de la page.
 */
export async function SectionCta() {
  const t = await getTranslations("Landing");

  // `svh` et pas `vh` : sur mobile, `vh` se mesure sur le viewport LARGE —
  // celui d'après la rétractation de la barre d'URL. Une section calée dessus
  // déborde donc de la hauteur de cette barre tant qu'elle est déployée,
  // c'est-à-dire à l'arrivée sur la page. `svh` prend le viewport PETIT (barre
  // déployée) : la section tient à l'écran d'emblée, et gagne de l'air quand la
  // barre se rétracte plutôt que d'en manquer avant.
  return (
    <section className="relative isolate flex min-h-[80svh] items-center overflow-hidden border-t border-border py-24 sm:min-h-svh sm:py-32">
      <CtaShader />
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <RevealHeading
          className="mb-4 text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
          text={t("ctaTitle")}
        />
        <Reveal
          as="p"
          delay={0.15}
          className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
        >
          {t("ctaSubtitle")}
        </Reveal>
        <Reveal delay={0.25}>
          <Button asChild size="lg">
            <TrackedCta href="/signup" location="cta_section">
              {t("ctaButton")}
              <ArrowRight data-icon="inline-end" />
            </TrackedCta>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
