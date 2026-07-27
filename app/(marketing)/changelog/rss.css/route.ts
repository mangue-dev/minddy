import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

/**
 * La feuille de style du flux RSS (MIN-93) — pour que « Suivre en RSS » n'ouvre
 * pas un mur de XML.
 *
 * ## Pourquoi du CSS et pas du XSLT
 *
 * L'habillage d'un flux se fait traditionnellement en XSLT, et c'est ce que font
 * la plupart des blogs. Sauf que Chrome a annoncé en octobre 2025 la SUPPRESSION
 * de XSLT : dépréciation en Chrome 143, arrêt sur les versions stables au
 * 17 novembre 2026 — Firefox et WebKit ont dit qu'ils suivraient. Écrire une
 * feuille XSLT aujourd'hui, c'est écrire quelque chose qui casse dans quelques
 * mois.
 *
 * Le CSS appliqué à un document XML, lui, n'est pas concerné : c'est un autre
 * mécanisme (on style l'arbre XML tel quel, sans moteur de transformation).
 *
 * ## Ce que ça permet, et ce que ça ne permet pas
 *
 * On PEUT masquer, réordonner visuellement, typographier, et poser du texte en
 * `::before`. On ne PEUT PAS transformer l'arbre ni rendre un `<link>` RSS
 * cliquable : dans un flux c'est un nœud texte, pas une ancre HTML. D'où le
 * bandeau qui explique quoi faire de l'adresse plutôt qu'un bouton.
 *
 * Le flux reste un flux : un lecteur ignore purement et simplement
 * l'instruction de traitement qui pointe ici.
 */

export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get("locale") ?? "";
  const locale = ((locales as readonly string[]).includes(raw) ? raw : defaultLocale) as Locale;
  const t = await getTranslations({ locale, namespace: "Changelog" });

  const body = `/* minddy · habillage du flux du changelog. */

/* Tout est masqué par défaut : un flux porte des nœuds qui n'ont aucun sens à
   l'écran (guid, langue, date de build, le lien atom vers lui-même), et les
   énumérer un par un obligerait à revenir ici au moindre champ ajouté. */
* {
  display: none;
}

rss,
channel,
item {
  display: block;
}

rss {
  --bg: #ffffff;
  --fg: #101114;
  --muted: #6b7280;
  --line: #e5e7eb;
  --accent: #f4f4f5;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

@media (prefers-color-scheme: dark) {
  rss {
    --bg: #0d0e10;
    --fg: #fafafa;
    --muted: #9ca3af;
    --line: #26272b;
    --accent: #17181b;
  }
}

channel {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.25rem 4rem;
}

/* Le bandeau : la seule chose qu'un visiteur arrivé ici par curiosité a besoin
   de lire. Posé en ::before parce qu'il n'existe dans aucun nœud du flux, et
   il ne doit pas y exister, ce serait du bruit pour les lecteurs. */
channel::before {
  content: ${cssString(t("feedBannerTitle"))} "\\A" ${cssString(t("feedBannerBody"))};
  white-space: pre-line;
  display: block;
  margin-bottom: 2.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: 0.875rem;
  background: var(--accent);
  color: var(--muted);
  font-size: 0.875rem;
}

channel > title {
  display: block;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

channel > description {
  display: block;
  margin-top: 0.5rem;
  color: var(--muted);
}

item {
  border-top: 1px solid var(--line);
  margin-top: 2rem;
  padding-top: 2rem;
}

item > pubDate {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
}

item > title {
  display: block;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

item > description {
  display: block;
  margin-top: 0.5rem;
  color: var(--muted);
}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * Une chaîne CSS entre guillemets. Le texte vient du catalogue de traduction :
 * un guillemet droit ou un antislash y suffirait à casser la règle, et une
 * règle cassée ne se voit pas — elle est simplement ignorée.
 */
function cssString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
