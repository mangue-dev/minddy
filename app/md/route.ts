import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import {
  COMPARISONS,
  COMPARISON_POINTS,
  COMPARISON_ROWS,
  type Comparison,
} from "@/lib/comparisons";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import { PUBLIC_ROUTES, routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FAQ_KEYS,
  MCP_FAQ_KEYS,
  PRICING_FAQ_KEYS,
} from "@/components/marketing/faq-keys";

/**
 * Version Markdown des pages publiques (MIN-88), servie sur négociation de
 * contenu : `Accept: text/markdown` sur `/` ou `/fr/tarifs` arrive ici, réécrit
 * par le proxy. Chaque page HTML l'annonce aussi par un en-tête
 * `Link: <…>; rel="alternate"; type="text/markdown"`.
 *
 * **Pourquoi.** Un agent qui veut lire une page paie aujourd'hui 440 Ko de HTML
 * pour en extraire 4 Ko de texte, et doit deviner la structure au passage. Le
 * Markdown lui donne le même contenu, hiérarchisé, sans un octet de balisage
 * inutile. C'est l'un des points que note l'auditeur agentique de Cloudflare, et
 * le seul de sa liste qui coûte quelque chose à produire.
 *
 * **Ce que ça n'est pas.** Pas un miroir octet pour octet du HTML. Le contenu
 * est reconstruit depuis LES MÊMES CLÉS i18n que les composants — donc il ne
 * peut pas raconter autre chose que la page — mais l'ordre et le regroupement
 * sont réécrits pour un lecteur qui lit du texte, pas une mise en page. Les
 * quatre pages légales renvoient leur titre, leur description et un lien : leur
 * corps est de la prose structurée en JSX, le réécrire ici en ferait une
 * deuxième source de vérité juridique, ce qu'on ne veut à aucun prix.
 */

const KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

/** Les comparatifs, retrouvés par la clé de route que le proxy nous passe. */
const COMPARISON_BY_ROUTE = new Map<string, Comparison>(
  COMPARISONS.map((comparison) => [comparison.routeKey, comparison]),
);

/**
 * Quelle page rendre, et dans quelle langue — lu dans les EN-TÊTES posés par le
 * proxy, avec la query en secours.
 *
 * Le proxy passait l'information en query (`/md?route=pricing&locale=fr`).
 * Elle n'arrivait pas : sur une réécriture de middleware, Next 16 donne au
 * route handler l'URL D'ORIGINE (`request.nextUrl` et `request.url` valent
 * `/pricing`), pas la cible. `route` était donc toujours absent, `/md` retombait
 * sur son défaut, et TOUTES les pages du site servaient le Markdown de la
 * landing — mesuré en construisant la version Markdown des pages de MIN-93.
 *
 * Les en-têtes de requête, eux, traversent la réécriture : c'est déjà par là
 * que `x-minddy-locale` atteint `i18n/request.ts`.
 *
 * La query reste lue en second pour que `/md?route=…&locale=…` continue de
 * fonctionner en appel direct — c'est ce qu'on tape pour vérifier une page.
 */
function requested(request: NextRequest): { rawKey: string; rawLocale: string } {
  const params = request.nextUrl.searchParams;
  return {
    rawKey: request.headers.get("x-minddy-route") ?? params.get("route") ?? "",
    rawLocale: request.headers.get("x-minddy-locale") ?? params.get("locale") ?? "",
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const { rawKey, rawLocale } = requested(request);

  const key = (KEYS.has(rawKey) ? rawKey : "home") as PublicRouteKey;
  const locale = ((locales as readonly string[]).includes(rawLocale)
    ? rawLocale
    : defaultLocale) as Locale;

  const route = routeByKey(key);
  const canonical = `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;

  let body: string;
  if (key === "home") body = await renderLanding(locale, canonical);
  else if (key === "pricing") body = await renderPricing(locale, canonical);
  else if (key === "mcp") body = await renderMcp(locale, canonical);
  else if (key === "changelog") body = await renderChangelog(locale, canonical);
  else if (COMPARISON_BY_ROUTE.has(key))
    body = await renderComparison(COMPARISON_BY_ROUTE.get(key)!, locale, canonical);
  else body = await renderLegal(key, locale, canonical);

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonical}>; rel="canonical"`,
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

function header(title: string, description: string, canonical: string): string {
  return `# ${title}\n\n> ${description}\n\nCanonical: ${canonical}\n`;
}

async function renderLanding(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Landing" });

  const sections: Array<[string, string, Array<[string, string]>]> = [
    [
      t("featuresTitle"),
      t("featuresSubtitle"),
      [],
    ],
    [t("speedTitle"), t("speedSubtitle"), []],
    [
      t("agentsTitle"),
      t("agentsSubtitle"),
      (
        [
          "read",
          "plan",
          "track",
          "create",
          "comment",
          "wiki",
          "review",
          "beyond",
        ] as const
      ).map((k) => ["", t(`agentsCapability_${k}`)] as [string, string]),
    ],
    [
      t("feedbackTitle"),
      t("feedbackSubtitle"),
      (["post", "moderate", "decide", "status"] as const).map(
        (k) => [t(`feedback_${k}_title`), t(`feedback_${k}_body`)] as [string, string],
      ),
    ],
    [
      t("moreTitle"),
      t("moreSubtitle"),
      (["share", "import", "api"] as const).map(
        (k) => [t(`more_${k}_title`), t(`more_${k}_body`)] as [string, string],
      ),
    ],
    [t("pricingTitle"), t("pricingSubtitle"), []],
  ];

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitleBefore")} ${t("heroTitleAccent")}`,
    t("heroSubtitle"),
    t("heroNote"),
    ...sections.flatMap(([title, subtitle, items]) => [
      `## ${title}`,
      subtitle,
      ...(items.length
        ? [items.map(([name, body]) => (name ? `- **${name}**: ${body}` : `- ${body}`)).join("\n")]
        : []),
    ]),
    `## ${t("faqTitle")}`,
    FAQ_KEYS.map((k) => `### ${t(`faq_${k}_q`)}\n\n${t(`faq_${k}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderPricing(locale: Locale, canonical: string): Promise<string> {
  const [t, tb] = await Promise.all([
    getTranslations({ locale, namespace: "Pricing" }),
    getTranslations({ locale, namespace: "Billing" }),
  ]);
  const planNameKey = { free: "planFree", go: "planGo", pro: "planPro" } as const;

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    // Les prix viennent de BILLING_PLANS, jamais d'une copie — même règle que
    // les données structurées.
    BILLING_PLANS.map(
      (plan) => `- **${tb(planNameKey[plan.id])}**: ${plan.priceEurMonthly} EUR / month`,
    ).join("\n"),
    `## ${t("comparisonTitle")}`,
    t("comparisonSubtitle"),
    "## FAQ",
    PRICING_FAQ_KEYS.map((k) => `### ${t(`faq_${k}_q`)}\n\n${t(`faq_${k}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

/**
 * `/mcp` en Markdown (MIN-93) — la seule page du site dont la version texte a
 * une chance d'être VRAIMENT lue par une machine, puisque son sujet est de
 * brancher une machine.
 *
 * Contrairement à `/llms.txt`, qui s'adresse à l'assistant en train d'écrire
 * l'intégration, celle-ci rend la page telle qu'elle est lue : les blocs de
 * configuration par agent, l'autorisation, les outils groupés, et surtout les
 * trois phrases qu'on tape à son agent. Mêmes sources exactement — le registre
 * `MCP_AGENTS` et le catalogue d'outils — donc aucune des deux ne peut décrire
 * un serveur que minddy n'expose plus.
 */
async function renderMcp(locale: Locale, canonical: string): Promise<string> {
  const [t, tl] = await Promise.all([
    getTranslations({ locale, namespace: "Mcp" }),
    getTranslations({ locale, namespace: "Landing" }),
  ]);

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    t("heroNote"),
    [
      `- **${t("factEndpoint")}**: \`${MCP_ENDPOINT}\``,
      `- **${t("factAuth")}**: ${t("factAuthValue")}`,
    ].join("\n"),

    `## ${t("connectTitle")}`,
    t("connectSubtitle"),
    // Le prompt d'abord : un lecteur qui EST une machine n'a pas besoin des
    // sept blocs de configuration, il a besoin de la consigne.
    `### ${t("assistantTitle")}`,
    t("assistantBody"),
    `> ${t("assistantPrompt", { endpoint: MCP_ENDPOINT, guide: `${SITE_URL}/llms.txt` })}`,
    MCP_AGENTS.map((agent) =>
      [
        `### ${agent.label}`,
        t(`kind_${agent.kind}`),
        // Un bloc clôturé plutôt qu'un `code` en ligne : la configuration de
        // Windsurf tient sur cinq lignes, et un agent qui relit ce fichier doit
        // pouvoir la recopier telle quelle.
        `\`\`\`\n${agent.build(MCP_ENDPOINT)}\n\`\`\``,
      ].join("\n\n"),
    ).join("\n\n"),

    `## ${t("authTitle")}`,
    t("authSubtitle"),
    (["who", "consent", "revoke"] as const)
      .map((key) => `- **${t(`auth_${key}_title`)}**: ${t(`auth_${key}_body`)}`)
      .join("\n"),

    `## ${t("toolsTitle")}`,
    t("toolsSubtitle"),
    // Les mêmes phrases que la page et que la landing. La référence complète des
    // outils vit dans `/llms-full.txt`, qui s'adresse aux machines — la
    // dupliquer ici ne servirait personne.
    ([
      "read",
      "plan",
      "track",
      "create",
      "comment",
      "wiki",
      "review",
      "beyond",
    ] as const)
      .map((key) => `- ${tl(`agentsCapability_${key}`)}`)
      .join("\n"),

    `## ${t("flowsTitle")}`,
    t("flowsSubtitle"),
    (["plan", "track", "create"] as const)
      .map((key) =>
        [
          `### ${t(`flow_${key}_title`)}`,
          t(`flow_${key}_body`),
          `> ${t(`flow_${key}_prompt`)}`,
        ].join("\n\n"),
      )
      .join("\n\n"),

    "## FAQ",
    MCP_FAQ_KEYS.map((key) => `### ${t(`faq_${key}_q`)}\n\n${t(`faq_${key}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

/**
 * Le changelog en Markdown (MIN-93) — la version texte la plus simple du site,
 * et probablement la plus utile : « qu'est-ce qui a changé dans minddy » est
 * une question qu'on pose à un modèle, et il n'a besoin que de dates et de
 * phrases.
 */
async function renderChangelog(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Changelog" });

  return [
    // Pas de sous-titre : la page n'en a plus, et l'en-tête porte déjà la
    // description. Une phrase de plus avant la liste ne dirait rien de neuf.
    header(t("metaTitle"), t("metaDescription"), canonical),
    ...CHANGELOG_ENTRIES.map((entry) =>
      [
        `## ${t(`entry_${entry.id}_title` as MessageKey<"Changelog">)}`,
        `*${entry.date}*`,
        t(`entry_${entry.id}_body` as MessageKey<"Changelog">),
      ].join("\n\n"),
    ),
    links(locale),
  ].join("\n\n") + "\n";
}

/**
 * Un comparatif en Markdown (MIN-93). Le tableau HTML devient un vrai tableau
 * Markdown : c'est la forme qu'un modèle recopie sans se tromper de colonne, et
 * la seule raison pour laquelle une version texte de cette page a un intérêt.
 *
 * L'ordre de la page est conservé — ce que l'autre outil fait mieux vient
 * AVANT ce que minddy fait autrement. Une version texte qui inverserait les
 * deux ne dirait pas la même chose que la page qu'elle prétend refléter.
 */
async function renderComparison(
  comparison: Comparison,
  locale: Locale,
  canonical: string,
): Promise<string> {
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: "Alternatives" }),
    getTranslations({ locale, namespace: comparison.namespace }),
  ]);
  const cell = (row: (typeof COMPARISON_ROWS)[number]) => [
    t(`minddy_${row}`),
    tc(`them_${row}`),
  ];

  return [
    header(tc("metaTitle"), tc("metaDescription"), canonical),
    `## ${tc("heroTitle")}`,
    tc("heroSubtitle"),

    `## ${t("compareTitle")}`,
    t("compareSubtitle"),
    [
      `| | ${t("columnUs")} | ${comparison.name} |`,
      "| --- | --- | --- |",
      ...COMPARISON_ROWS.map((row) => `| ${t(`row_${row}`)} | ${cell(row).join(" | ")} |`),
    ].join("\n"),
    `${t("checkedNote")} ${comparison.pricingUrl}`,

    `## ${t("betterThemTitle", { name: comparison.name })}`,
    COMPARISON_POINTS.map((point) => `- ${tc(`betterThem_${point}`)}`).join("\n"),

    `## ${t("betterUsTitle")}`,
    COMPARISON_POINTS.map((point) => `- ${tc(`betterUs_${point}`)}`).join("\n"),

    `## ${t("verdictTitle")}`,
    tc("verdictThem"),
    tc("verdictUs"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderLegal(
  key: PublicRouteKey,
  locale: Locale,
  canonical: string,
): Promise<string> {
  const route = routeByKey(key);
  const t = await getTranslations({ locale, namespace: route.namespace });
  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `The full text of this page is only published as HTML: ${canonical}`,
    links(locale),
  ].join("\n\n") + "\n";
}

function links(locale: Locale): string {
  const path = (key: PublicRouteKey) => {
    const route = routeByKey(key);
    return `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;
  };
  return [
    "## Links",
    `- Home: ${path("home")}`,
    `- Pricing: ${path("pricing")}`,
    `- MCP server: ${path("mcp")}`,
    `- Changelog: ${path("changelog")}`,
    `- MCP integration guide: ${SITE_URL}/llms.txt`,
    `- Terms: ${path("terms")}`,
    `- Privacy: ${path("privacy")}`,
  ].join("\n");
}
