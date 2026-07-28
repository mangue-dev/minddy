import { getTranslations } from "next-intl/server";
import { Link2, Plug2, Upload, type LucideIcon } from "lucide-react";
import { Reveal, RevealHeading } from "./reveal";

/**
 * §6 — « Et le reste est déjà là » (nouvelle section).
 *
 * La moitié « tout en un » du positionnement n'était affirmée nulle part : la
 * page démontrait la simplicité et laissait croire qu'elle se payait en
 * fonctionnalités manquantes. Ces quatre-là existent, sont vendables, et
 * n'avaient aucune place — trop petites pour une section, trop utiles pour être
 * tues.
 *
 * Bande courte et sans capture, DÉLIBÉRÉMENT : c'est ce qui empêche la section
 * de devenir un catalogue et de contredire le titre de §2 (« Rien de plus »).
 * La tension complétude / simplicité se résout dans le sous-titre — tout est là,
 * mais il n'y a qu'une façon de faire chaque chose.
 *
 * Ce qui a été laissé dehors sciemment : les statistiques, les sous-tickets et
 * les relations « bloque / bloqué par ». Ils existent aussi ; les ajouter ferait
 * exactement le catalogue qu'on évite.
 *
 * Deux entrées ont été retirées. Les WEBHOOKS SORTANTS n'existent pas : les
 * seules routes `app/api/webhooks/*` reçoivent GitHub et GitLab, minddy ne
 * prévient aucun outil tiers. Et les langues et les thèmes ne sont pas un
 * argument de vente : c'est une préférence d'affichage, à sa place dans les
 * réglages du compte, pas dans une page qui promet de la sobriété.
 */

const ITEMS = [
  { key: "share", icon: Link2 },
  { key: "import", icon: Upload },
  { key: "api", icon: Plug2 },
] as const satisfies ReadonlyArray<{ key: string; icon: LucideIcon }>;

export async function SectionMore() {
  const t = await getTranslations("Landing");

  return (
    <section id="more" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("moreTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("moreSubtitle")}
          </Reveal>
        </header>

        {/* Quatre lignes, pas quatre cartes : la bande doit se parcourir d'un
            coup d'œil et se lire comme une liste de fin d'argumentaire, pas
            comme une deuxième grille produit. */}
        <Reveal as="ul" className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="mb-1 font-medium">{t(`more_${item.key}_title`)}</h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {t(`more_${item.key}_body`)}
                  </p>
                </div>
              </li>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
