import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import {
  desktopFeedBaseUrl,
  dmgEntry,
  formatBytes,
  parseLatestMacFeed,
} from "@/lib/desktop/update-feed";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { DesktopShowcase } from "@/components/marketing/desktop-showcase";
import { SectionCta } from "@/components/marketing/section-cta";
import { TrackedDownloadLink } from "@/components/marketing/tracked-download-link";
import { IsoTile, type IsoTileName } from "@/components/marketing/iso-tile";

/**
 * `/download` — l'app de bureau macOS (MIN-292).
 *
 * **Une PAGE et non un bouton sur la landing**, parce qu'il y a ici quelque
 * chose d'honnête à dire qui ne tient pas sous un bouton : app quittée, plus de
 * notification. Electron n'embarque pas le service de push de Chromium (§3 du
 * cadrage), alors que le site et l'app web installée sonnent même fermés. Le
 * taire serait la seule malhonnêteté du site ; l'écrire en petit sous un bouton
 * reviendrait au même — d'où sa place, à mi-page, à la même taille que la
 * réassurance qui lui fait face.
 *
 * **Les chiffres sont LUS, pas écrits.** La version et le poids viennent du
 * manifeste du flux (`latest-mac.yml`), avec une heure de cache. Un « ~100 Mo »
 * en dur dans `messages/*.json` serait faux à la publication suivante, et
 * personne ne penserait à le corriger. Flux injoignable → la page tombe sur des
 * valeurs génériques et garde son bouton : elle ne se prive jamais de son seul
 * geste utile.
 *
 * La mise en page rompt avec les autres pages publiques, qui sont toutes
 * centrées : ici le hero est en DEUX COLONNES, texte à gauche, app à droite.
 * C'est la seule page du site dont le sujet est un objet — il faut le montrer,
 * pas en parler.
 */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "download", locale: (await getLocale()) as Locale });
}

/**
 * Ce que l'app apporte, dans l'ordre où on s'en aperçoit en l'utilisant.
 *
 * Les icônes sont celles de la landing — couchées dans l'isométrie de l'app
 * (`IsoTile`), et non une lucide de face dans une pastille arrondie. Cette page
 * était la dernière du site à porter l'ancien dessin, celui qui ne dit rien de
 * minddy ; un nom suffit ici, la résolution se fait dans le registre.
 */
const POINTS = [
  { key: "window", icon: "window" },
  { key: "notifications", icon: "bell" },
  { key: "updates", icon: "refresh" },
] as const satisfies ReadonlyArray<{ key: string; icon: IsoTileName }>;

/**
 * La version et le poids du `.dmg` Apple silicon, lus dans le flux.
 *
 * `revalidate` plutôt que `no-store` : la page reste servie depuis le cache —
 * c'est une page publique, elle doit rester rapide — et se rafraîchit dans
 * l'heure qui suit une publication. Une erreur ne remonte jamais : une page de
 * téléchargement sans son bouton serait pire qu'un numéro de version périmé.
 */
async function currentRelease(): Promise<{ version: string; size: number | null } | null> {
  const base = desktopFeedBaseUrl();
  if (!base) return null;
  const response = await fetch(`${base}/latest-mac.yml`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!response?.ok) return null;
  const release = parseLatestMacFeed(await response.text());
  if (!release) return null;
  return { version: release.version, size: dmgEntry(release, "arm64")?.size ?? null };
}

export default async function DownloadPage() {
  const locale = (await getLocale()) as Locale;
  const [t, release] = await Promise.all([getTranslations("Download"), currentRelease()]);

  const specs = [
    {
      key: "version",
      label: t("specVersion"),
      value: release ? release.version : t("specVersionUnknown"),
    },
    {
      key: "size",
      label: t("specSize"),
      value: release?.size ? formatBytes(release.size, locale) : t("specSizeUnknown"),
    },
    { key: "os", label: t("specOs"), value: t("specOsValue") },
    { key: "signed", label: t("specSigned"), value: t("specSignedValue") },
  ];

  return (
    <>
      {/* ── Le téléchargement, et l'objet ────────────────────────────────── */}
      <section className="overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            <div>
              <Reveal
                as="p"
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground"
              >
                {/* Le logo Apple n'est pas dans lucide, et le pictogramme d'une
                    marque tierce se dessine ou ne se met pas. Le mot suffit. */}
                {t("eyebrow")}
              </Reveal>

              {/* `Reveal` et non `RevealHeading` : celui-ci découpe le texte mot
                  à mot, ce qui interdit de styler une PARTIE du titre. Or
                  l'accent en serif italique — la seule fantaisie typographique
                  du site, portée par le hero de la landing — est ce qui rattache
                  cette page aux autres. */}
              <Reveal
                as="h1"
                delay={0.06}
                className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
              >
                {t("heroTitle")}{" "}
                <span className="font-serif font-normal italic">{t("heroTitleAccent")}</span>
              </Reveal>

              <Reveal
                as="p"
                delay={0.18}
                className="mt-5 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground"
              >
                {t("heroSubtitle")}
              </Reveal>

              {/* Un `<a>` et non un `<Link>` : la cible n'est pas une page mais
                  une redirection vers un fichier de cent vingt mégaoctets. Un
                  préchargement de route n'aurait aucun sens. */}
              <Reveal
                delay={0.26}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"
              >
                <Button asChild size="lg">
                  <TrackedDownloadLink arch="arm64" href="/api/desktop/download">
                    <Download data-icon="inline-start" />
                    {t("downloadButton")}
                  </TrackedDownloadLink>
                </Button>
                <TrackedDownloadLink
                  arch="x64"
                  href="/api/desktop/download?arch=x64"
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {t("downloadIntel")}
                </TrackedDownloadLink>
              </Reveal>

              <Reveal as="p" delay={0.32} className="mt-4 text-xs text-muted-foreground">
                {t("requirements")}
              </Reveal>

              {/* macOS est la seule cible, et ça se dit ICI — sous le bouton,
                  pas à mi-page. Depuis MIN-292 la landing mène directement à
                  cette page par un bouton « Télécharger pour Mac » : quelqu'un
                  sous Windows ou Linux y arrive, et doit avoir sa réponse avant
                  d'avoir à défiler pour la chercher.
                  Et elle ne s'arrête pas au refus : sur ces machines minddy
                  s'utilise dans le navigateur, ce qui est une réponse, pas une
                  porte fermée. */}
              <Reveal as="p" delay={0.36} className="mt-1.5 text-xs text-muted-foreground">
                {t("platformNote")}
              </Reveal>
            </div>

            {/* `-mr-6` : la composition mord sur la marge droite en grand écran.
                C'est ce qui la sort de la grille et lui donne son échelle. */}
            <Reveal delay={0.1} className="lg:-mr-14">
              <DesktopShowcase />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Les faits ────────────────────────────────────────────────────────
          Une bande de quatre cases séparées par des filets d'un pixel, dans le
          goût d'une fiche technique : l'étiquette en petit au-dessus, la valeur
          en dessous. Deux des quatre sont LUES dans le flux, donc toujours
          vraies. `gap-px` sur un fond `bg-border` dessine les filets sans une
          seule bordure à gérer aux jonctions. */}
      <section className="border-y border-border">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <RevealGroup
            as="dl"
            step={0.05}
            className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4"
          >
            {specs.map((spec) => (
              <div key={spec.key} className="bg-background px-5 py-6 sm:px-6 sm:py-7">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground/80">
                  {spec.label}
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-foreground">{spec.value}</dd>
              </div>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Ce que l'app ajoute ──────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-12 max-w-2xl">
            <RevealHeading
              className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
              text={t("pointsTitle")}
            />
            <Reveal
              as="p"
              delay={0.15}
              className="leading-relaxed text-pretty text-muted-foreground"
            >
              {t("pointsSubtitle")}
            </Reveal>
          </header>

          <RevealGroup as="ul" step={0.08} className="grid gap-10 sm:grid-cols-3">
            {POINTS.map((point) => (
              /* Un filet au-dessus de chaque colonne, et rien autour : trois
                 traits qui répondent à la bande de faits sans la répéter en
                 cartes. Trois cartes bordées de plus auraient fait de la page
                 une grille de boîtes. */
              <li key={point.key} className="border-t border-border pt-6">
                <IsoTile name={point.icon} className="mb-4 w-14" />
                <h3 className="mb-2 text-base font-medium">{t(`point_${point.key}_title`)}</h3>
                <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                  {t(`point_${point.key}_body`)}
                </p>
              </li>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Le renoncement, et sa contrepartie ───────────────────────────────
          Les deux à la MÊME taille, et le renoncement en premier. L'inverse — la
          bonne nouvelle en grand, la mauvaise en note de bas de page — est
          exactement la mise en page qui donne envie de ne pas lire. */}
      <section className="border-t border-border bg-muted/20 py-16 sm:py-24">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="grid gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border md:grid-cols-2">
            <Reveal className="bg-background p-6 sm:p-8">
              <h2 className="mb-2.5 font-medium">{t("noticeTitle")}</h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {t("noticeBody")}
              </p>
            </Reveal>
            <Reveal delay={0.1} className="bg-background p-6 sm:p-8">
              <h2 className="mb-2.5 font-medium">{t("noticeCounterTitle")}</h2>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {t("noticeCounterBody")}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <SectionCta />
    </>
  );
}
