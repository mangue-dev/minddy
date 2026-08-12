import { getTranslations } from "next-intl/server";
import { ScreenshotSlot } from "./screenshot-slot";
import { Reveal, RevealGroup, RevealHeading } from "./reveal";
import { IsoTile, type IsoTileName } from "./iso-tile";

/**
 * §5 — « Les pages » (MIN-254).
 *
 * Le wiki par projet n'était mentionné NULLE PART sur la landing. Il y est
 * entré d'abord comme une ligne de la bande « Et le reste est déjà là », ce qui
 * était deux fois faux : c'est une surface entière du produit — un éditeur, une
 * arborescence, une publication, un historique — et c'est surtout le seul
 * endroit où le « tout en un » se vérifie sans effort. Un visiteur qui garde
 * Notion ouvert à côté de son tracker est précisément celui à qui cette page
 * s'adresse.
 *
 * ELLE SUIT LA VITESSE ET PRÉCÈDE LES RETOURS, et cette place n'est pas
 * arbitraire : la ligne d'ouverture de la section suivante dit « jusqu'ici,
 * tout venait de vous ». Les pages sont le dernier lieu où c'est encore vrai —
 * ce que vous écrivez, ce que vos agents écrivent — avant que la page ne bascule
 * sur ce qui arrive de vos utilisateurs.
 *
 * TOUT CE QUI EST DIT ICI EXISTE, et a été vérifié dans le code plutôt que
 * déduit du nom de la fonctionnalité :
 *   - les sous-pages sont un bloc de l'éditeur (`Pages.blockSubpage`), donc
 *     l'arborescence se construit en écrivant, pas dans un menu à part ;
 *   - une mention mène à un ticket, un objectif ou une autre page
 *     (`lib/mention-target.ts`) — c'est le lien entre le wiki et le tracker,
 *     et c'est ce qui fait qu'ils ne sont pas deux outils dans le même onglet ;
 *   - la publication a trois niveaux, privé / mot de passe / lien public, et
 *     peut emporter les sous-pages (`PublishPage`) ;
 *   - l'historique gardé 30 jours se restaure d'un clic
 *     (`components/pages/page-history.tsx`), et l'export sort en Markdown ou en
 *     PDF, une page ou une branche entière ;
 *   - les agents ont huit outils MCP sur les pages, lecture, recherche,
 *     écriture et commentaire compris (`lib/server/mcp/page-tools.ts`).
 */

const POINTS = [
  { key: "write", icon: "pages" },
  { key: "link", icon: "share" },
  { key: "agents", icon: "message" },
  { key: "publish", icon: "api" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

export async function SectionPages() {
  const t = await getTranslations("Landing");

  return (
    <section id="pages" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <RevealHeading
            className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("pagesTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="leading-relaxed text-pretty text-muted-foreground"
          >
            {t("pagesSubtitle")}
          </Reveal>
        </header>

        <Reveal as="figure" className="mx-auto mb-12 flex max-w-4xl flex-col gap-3 sm:mb-16">
          <ScreenshotSlot id="pagesEditor" />
          <figcaption className="text-center text-sm text-muted-foreground">
            {t("pagesCaption")}
          </figcaption>
        </Reveal>

        {/* Grille à filets : entrée d'un bloc — masquer les cartes une à une
            découvrirait le fond `bg-border` du conteneur. */}
        <Reveal
          as="ul"
          className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
        >
          {POINTS.map((point) => (
            <li key={point.key} className="bg-card p-6">
              <IsoTile name={point.icon} className="mb-4 w-14" />
              <h3 className="mb-1.5 font-medium">{t(`pages_${point.key}_title`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`pages_${point.key}_body`)}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
