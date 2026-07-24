import type { CSSProperties } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Plug } from "lucide-react";
import { Button } from "mangue-ui";
import { ScreenshotSlot } from "./screenshot-slot";
import { TrackedCta } from "./tracked-cta";

/**
 * Hero de la landing (MIN-73). Promesse en une phrase, deux actions, la capture
 * du produit. Le mot accentué passe en Instrument Serif italique — la même
 * respiration typographique que le reste de la marque.
 *
 * Le shader n'est PAS rendu ici : il est posé au niveau de la page pour partir
 * du haut du document et passer derrière la navbar (voir `hero-shader.tsx`).
 *
 * Animation d'entrée : le titre se dévoile mot à mot puis le reste enchaîne en
 * cascade. Contrairement aux sections plus bas, rien n'est déclenché au scroll
 * — le hero est déjà à l'écran quand la page arrive, l'attendre coûterait le
 * temps d'hydratation pour rien. Tout est donc du CSS joué dès le premier
 * rendu, sans une ligne de JavaScript (voir `app/globals.css`).
 */

/**
 * Découpe un fragment de titre en mots animés, en poursuivant la numérotation
 * du fragment précédent (`start`) pour que la cascade traverse le passage en
 * italique sans repartir de zéro.
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

/** Nombre de mots d'un fragment — sert à chaîner les index de la cascade. */
function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function Hero() {
  const t = await getTranslations("Landing");

  const titleBefore = t("heroTitleBefore");
  const titleAccent = t("heroTitleAccent");
  // Le titre part à 0 s : c'est l'élément LCP, tout retard sur lui est un retard
  // sur la métrique. Le reste s'échelonne derrière sa dernière syllabe.
  const accentStart = wordCount(titleBefore);
  const afterTitle = 0.06 * (accentStart + wordCount(titleAccent)) + 0.18;

  return (
    <section className="pt-10 pb-16 sm:pb-24">
      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl pt-10 text-center sm:pt-16">
          <Link
            href="/#agents"
            style={{ "--hero-d": 0.1 } as CSSProperties}
            className="hero-reveal mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
          >
            <Plug className="h-3.5 w-3.5" />
            {t("heroBadge")}
          </Link>

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
            <Button asChild size="lg">
              <TrackedCta href="/signup" location="hero">
                {t("heroCtaPrimary")}
                <ArrowRight data-icon="inline-end" />
              </TrackedCta>
            </Button>
            <Button asChild size="lg" variant="outline">
              <TrackedCta href="/pricing" location="hero">
                {t("heroCtaSecondary")}
              </TrackedCta>
            </Button>
          </div>

          <p
            style={{ "--hero-d": afterTitle + 0.22 } as CSSProperties}
            className="hero-reveal mt-4 text-xs text-muted-foreground"
          >
            {t("heroNote")}
          </p>
        </div>

        <div
          style={{ "--hero-d": afterTitle + 0.3 } as CSSProperties}
          className="hero-reveal hero-reveal-media mt-14 sm:mt-20"
        >
          <ScreenshotSlot id="heroBoard" priority />
        </div>
      </div>
    </section>
  );
}
