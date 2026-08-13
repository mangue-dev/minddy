import type { CSSProperties } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { AgentLoopFigure } from "./agent-loop-figure";
import { TrackedCta } from "./tracked-cta";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Hero de la landing (MIN-73). Promesse en une phrase, deux actions, une image.
 * Le mot accentué passe en Instrument Serif italique — la même respiration
 * typographique que le reste de la marque.
 *
 * CE QU'IL PROMET (MIN-148). Le titre portait le tracker (« Un tracker complet,
 * et pourtant évident ») et l'image montrait un board : les deux premiers écrans
 * nous plaçaient sur le terrain de Linear, où un board ressemble forcément à un
 * board. Il porte maintenant la boucle — vous écrivez le ticket, l'agent prend
 * la suite — et l'image la montre (`agent-loop-figure.tsx`). Le tracker n'a pas
 * disparu : il est passé juste dessous, en réassurance (`section-tracker.tsx`).
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
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  const href = (path: string) => localizedHref(path, locale as Locale);

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
          {/* Le badge « Serveur MCP inclus dès le plan gratuit » a été retiré :
              il annonçait un détail d'offre au-dessus d'un titre que le
              visiteur n'a pas encore lu, et poussait le `<h1>` — l'élément LCP
              — d'une ligne vers le bas. Le sujet est traité là où il se pose :
              la section Agents, la page `/mcp` et le tableau des tarifs. */}
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
            {/* L'ACTION PREMIÈRE EST LE TÉLÉCHARGEMENT (MIN-292).

                Elle a pris la place de « Commencer gratuitement », et ce qui
                rendait ce choix impossible a été levé au même moment : l'app
                s'ouvrait sur l'écran de CONNEXION, donc télécharger sans compte
                menait dans le mur. Elle s'ouvre désormais sur l'inscription
                (`login-form.tsx`), et le geste se termine là où il promettait
                d'aller.

                Elle vise la PAGE et non `/api/desktop/download` : lâcher 120 Mo
                sur le clic de quelqu'un qui vient de lire un titre serait
                brutal, et la page porte ce que le bouton ne peut pas dire — la
                puce Intel, la configuration requise, et les notifications qui
                s'arrêtent quand on quitte l'app. */}
            <Button asChild size="lg">
              <a href={href("/download")}>
                <Download data-icon="inline-start" />
                {t("heroCtaDownload")}
              </a>
            </Button>
            {/* L'action secondaire ne vise plus /pricing : demander le prix à
                quelqu'un qui vient de lire le titre arrive trop tôt, et la note
                juste en dessous répond déjà (« gratuit jusqu'à 2 projets »).
                Elle envoie au parcours ticket → pull request, la question
                qu'on se pose réellement à cet instant.

                Et elle n'est plus `TrackedCta` : `landing_cta_clicked` compte
                les entrées vers l'INSCRIPTION, or c'est devenu un défilement
                dans la page. L'y laisser gonflerait « hero » avec des gens qui
                voulaient seulement lire la suite. */}
            <Button asChild size="lg" variant="outline">
              <a href={href("/#workflow")}>{t("heroCtaSecondary")}</a>
            </Button>
          </div>

          {/* La note d'offre, et l'entrée par le NAVIGATEUR — qui a échangé sa
              place avec le téléchargement (MIN-292).

              Elle descend d'un bouton à une note, mais elle ne DISPARAÎT pas, et
              c'est ce qui compte : la landing est vue depuis Windows, Linux et
              les téléphones, où le bouton du dessus ne mène nulle part. Elle
              reste par ailleurs un bouton plein dans la barre de navigation, à
              l'écran en permanence.

              Elle garde son `TrackedCta` : `landing_cta_clicked` compte les
              entrées vers l'INSCRIPTION, et celle-ci en est une — la déplacer
              sans la tracker aurait fait chuter « hero » à zéro dans les
              statistiques sans qu'aucun visiteur n'ait changé de comportement. */}
          <p
            style={{ "--hero-d": afterTitle + 0.22 } as CSSProperties}
            className="hero-reveal mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          >
            <span>{t("heroNote")}</span>
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
            <TrackedCta
              href="/signup"
              location="hero"
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("heroNoteSignup")}
            </TrackedCta>
          </p>
        </div>

        {/* SANS DÉLAI, contrairement au reste de la cascade (MIN-88). C'était
            une capture, donc le second candidat LCP : mesuré, sa place en fin de
            cascade (≈ 0,95 s d'attente) pesait ~1,2 s de « render delay ». La
            figure n'est plus une image et le titre reste le seul candidat
            sérieux, mais on garde le départ à 0 s et le plancher d'opacité de
            `hero-reveal-media` : rien à y gagner à retarder ce qui est déjà
            gratuit, et le titre reste éligible dès la première frame. */}
        <div className="hero-reveal hero-reveal-media mt-14 sm:mt-20">
          <AgentLoopFigure />
        </div>
      </div>
    </section>
  );
}
