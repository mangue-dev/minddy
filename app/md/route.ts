import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { MARKDOWN_LOCALE_COPY } from "@/lib/markdown-locale-copy";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import {
  COMPARISONS,
  COMPARISON_FEATURES,
  COMPARISON_REVIEWED_AT,
  COMPARISON_POINTS,
  COMPARISON_ROWS,
  type Comparison,
} from "@/lib/comparisons";
import { MCP_AGENTS } from "@/lib/mcp-agents";
import {
  PUBLIC_ROUTES,
  publicPathForLocale,
  routeByKey,
  type PublicRouteKey,
} from "@/lib/public-routes";
import { MCP_ENDPOINT, MINDDY_REPOSITORY_URL, SITE_URL } from "@/lib/site";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FAQ_KEYS,
  MCP_FAQ_KEYS,
  PRICING_FAQ_KEYS,
} from "@/components/marketing/faq-keys";

/**
 * Markdown version of public pages (MIN-88), served upon negotiation of
 * content: `Accept: text/markdown` on `/` or `/fr/tarifs` comes here, rewritten
 * by the proxy. Each HTML page also announces it with a header
 * `Link: <…>; rel="alternate"; type="text/markdown"`.
 *
 * **Why.** An agent that reads a page otherwise downloads 440 KB of HTML to
 * extract 4 KB of text and must infer the structure along the way. Markdown
 * provides the same hierarchical content without unnecessary markup. This is
 * one of the findings from Cloudflare's agentic auditor, and the only one on
 * that list that requires us to produce an additional representation.
 *
 * **What it is not.** It is not a byte-for-byte mirror of the HTML. The content
 * is rebuilt from the same i18n keys as the components, while its order and
 * grouping are adapted for a text reader. The four legal pages return their
 * title, description, and a link: their bodies are structured prose in JSX,
 * and reproducing them here would create a second source of legal truth.
 */

const KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

/** The comparisons, found by the route key that the proxy gives us. */
const COMPARISON_BY_ROUTE = new Map<string, Comparison>(
  COMPARISONS.map((comparison) => [comparison.routeKey, comparison]),
);

const DOWNLOAD_PLATFORM_NAMESPACES = {
  downloadMobile: "DownloadMobile",
} as const;

type DownloadPlatformRouteKey = keyof typeof DOWNLOAD_PLATFORM_NAMESPACES;

function isDownloadPlatformRoute(key: PublicRouteKey): key is DownloadPlatformRouteKey {
  return key in DOWNLOAD_PLATFORM_NAMESPACES;
}

/**
 * Which page to render, and in what language — read in the HEADERS set by the
 * proxy, with the query as a backup.
 *
 * The proxy originally passed the information in the query
 * (`/md?route=pricing&locale=fr`). That did not work: after a middleware
 * rewrite, Next 16 gives the route handler the original URL (`request.nextUrl`
 * and `request.url` both equal `/pricing`), not the target. `route` was therefore
 * absent, `/md` used its default, and every page served the landing Markdown.
 * This was observed while building the Markdown version of the MIN-93 pages.
 *
 * Request headers survive the rewrite; `x-minddy-locale` already reaches
 * `i18n/request.ts` through this path.
 *
 * The query remains the fallback so `/md?route=…&locale=…` continues to work
 * when called directly, which is useful for inspecting a page.
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
  const canonical = `${SITE_URL}${publicPathForLocale(route, locale)}`;

  let body: string;
  if (key === "home") body = await renderLanding(locale, canonical);
  else if (key === "pricing") body = await renderPricing(locale, canonical);
  else if (key === "mcp") body = await renderMcp(locale, canonical);
  else if (key === "selfHosting") body = await renderSelfHosting(locale, canonical);
  else if (key === "download") body = await renderDownload(locale, canonical);
  else if (isDownloadPlatformRoute(key))
    body = await renderDownloadPlatform(key, locale, canonical);
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

function header(
  title: string,
  description: string,
  canonical: string,
  locale: Locale,
): string {
  return `# ${title}\n\n> ${description}\n\n${MARKDOWN_LOCALE_COPY[locale].canonical}: ${canonical}\n`;
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
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
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
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    // Prices come from BILLING_PLANS, never from a copy — same rule as
    // structured data.
    BILLING_PLANS.map(
      (plan) =>
        `- **${tb(planNameKey[plan.id])}**: ${plan.priceEurMonthly} EUR / ${MARKDOWN_LOCALE_COPY[locale].perMonth}`,
    ).join("\n"),
    `## ${t("comparisonTitle")}`,
    t("comparisonSubtitle"),
    "## FAQ",
    PRICING_FAQ_KEYS.map((k) => `### ${t(`faq_${k}_q`)}\n\n${t(`faq_${k}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

/**
 * `/mcp` in Markdown (MIN-93) — the only page on the site whose text version has
 * a chance to REALLY be read by a machine, since its subject is
 * plug in a machine.
 *
 * Unlike `/llms.txt`, which addresses the wizard currently writing
 * integration, this renders the page as it is read: the blocks of
 * configuration by agent, authorization, grouped tools, and especially the
 * three sentences that you type to your agent. Exactly same sources — the register
 * `MCP_AGENTS` and the tool catalog — so neither can describe
 * a server that minddy no longer exposes.
 */
async function renderMcp(locale: Locale, canonical: string): Promise<string> {
  const [t, tl] = await Promise.all([
    getTranslations({ locale, namespace: "Mcp" }),
    getTranslations({ locale, namespace: "Landing" }),
  ]);

  return [
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    t("heroNote"),
    [
      `- **${t("factEndpoint")}**: \`${MCP_ENDPOINT}\``,
      `- **${t("factAuth")}**: ${t("factAuthValue")}`,
    ].join("\n"),

    `## ${t("connectTitle")}`,
    t("connectSubtitle"),
    // The prompt first: a reader which IS a machine does not need the
    // seven configuration blocks, it needs the instruction.
    `### ${t("assistantTitle")}`,
    t("assistantBody"),
    `> ${t("assistantPrompt", { endpoint: MCP_ENDPOINT, guide: `${SITE_URL}/llms.txt` })}`,
    MCP_AGENTS.map((agent) =>
      [
        `### ${agent.label}`,
        t(`kind_${agent.kind}`),
        // A closed block rather than an online `code`: the configuration of
        // Windsurf is five lines, and an agent who rereads this file must
        // be able to copy it as it is.
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
    // The same sentences as the page and the landing. The complete reference of
    // tools lives in `/llms-full.txt`, which is for machines — the
    // duplicating it here would help nobody.
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

async function renderSelfHosting(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "SelfHosting" });
  const foundations = ["app", "supabase", "data"] as const;
  const routes = [
    {
      title: t("localTitle"),
      body: t("localBody"),
      details: [t("localTime"), t("localFactUsers"), t("localFactNetwork"), t("localFactMemory")],
      cta: t("routeCtaLocal"),
    },
    {
      title: t("teamTitle"),
      body: t("teamBody"),
      details: [t("teamTime"), t("teamFactUsers"), t("teamFactNetwork"), t("teamFactMemory")],
      cta: t("routeCtaTeam"),
    },
  ];
  const operations = ["backup", "update", "diagnose"] as const;
  const installRoute = routeByKey("selfHostingInstall");
  const installUrl = `${SITE_URL}${publicPathForLocale(installRoute, locale)}`;

  return [
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    `- ${t("heroCtaPrimary")}: ${installUrl}`,
    `## ${t("promiseTitle")}`,
    t("promiseBody"),
    [t("promiseOne"), t("promiseTwo"), t("promiseThree")].map((item) => `- ${item}`).join("\n"),
    `## ${t("howTitle")}`,
    t("howBody"),
    foundations
      .map((key) => `- **${t(`foundation_${key}_title`)}**: ${t(`foundation_${key}_body`)}`)
      .join("\n"),
    `> ${t("howBoundary")}`,
    `## ${t("routesTitle")}`,
    t("routesBody"),
    routes
      .map(({ title, body, details, cta }) => [`### ${title}`, body, `- ${details.join("\n- ")}`, `_${cta}_`].join("\n\n"))
      .join("\n\n"),
    `## ${t("migrationTitle")}`,
    t("migrationBody"),
    `- **${t("migrationExportTitle")}**: ${t("migrationExportBody")}`,
    `- **${t("migrationImportTitle")}**: ${t("migrationImportBody")}`,
    `> ${t("migrationNote")}`,
    `## ${t("limitsTitle")}`,
    t("limitsBody"),
    t("limitsExcluded"),
    `## ${t("operationsTitle")}`,
    t("operationsSubtitle"),
    operations
      .map((key) => `- **${t(`operation_${key}_title`)}**: ${t(`operation_${key}_body`)}`)
      .join("\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderDownload(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Download" });
  const platformRoutes = [
    ["downloadMobile", "platformGuideMobile"],
  ] as const;

  return [
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    `## ${t("platformGuidesTitle")}`,
    t("platformGuidesSubtitle"),
    platformRoutes
      .map(([routeKey, labelKey]) => {
        const route = routeByKey(routeKey);
        return `- ${t(labelKey)}: ${SITE_URL}${publicPathForLocale(route, locale)}`;
      })
      .join("\n"),
    `## ${t("iosGuideTitle")}`,
    t("iosGuideBody"),
    `## ${t("androidGuideTitle")}`,
    t("androidGuideBody"),
    `## ${t("pointsTitle")}`,
    t("pointsSubtitle"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderDownloadPlatform(
  key: DownloadPlatformRouteKey,
  locale: Locale,
  canonical: string,
): Promise<string> {
  const t = await getTranslations({
    locale,
    namespace: DOWNLOAD_PLATFORM_NAMESPACES[key],
  });

  return [
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    `## ${t("availabilityTitle")}`,
    t("availabilityBody"),
    `## ${t("installTitle")}`,
    [t("stepOne"), t("stepTwo"), t("stepThree")]
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n"),
    `## ${t("noteTitle")}`,
    t("noteBody"),
    `## ${t("openSourceTitle")}`,
    t("openSourceBody"),
    links(locale),
  ].join("\n\n") + "\n";
}

/**
 * The changelog in Markdown (MIN-93) — the simplest text version of the site,
 * and probably the most useful: "what changed in minddy" is
 * a question you ask a model, and all he needs are dates and
 * phrases.
 */
async function renderChangelog(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Changelog" });

  return [
    // No subtitle: the page no longer has one, and the header already bears the
    // description. One more sentence before the list wouldn't say anything new.
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
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

/** Keep the comparison's evidence, capabilities, and reading order in Markdown. */
async function renderComparison(
  comparison: Comparison,
  locale: Locale,
  canonical: string,
): Promise<string> {
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: "Alternatives" }),
    getTranslations({ locale, namespace: comparison.namespace }),
  ]);
  const reviewedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${COMPARISON_REVIEWED_AT}T12:00:00Z`));
  const cell = (row: (typeof COMPARISON_ROWS)[number]) => [
    t(`minddy_${row}`),
    comparison.sources[row]
      ? `[${tc(`them_${row}`)}](${comparison.sources[row]})`
      : tc(`them_${row}`),
  ];

  return [
    header(tc("metaTitle"), tc("metaDescription"), canonical, locale),
    `## ${tc("heroTitle")}`,
    tc("heroSubtitle"),
    `### ${t("betterThemTitle", { name: comparison.name })}`,
    tc("verdictThem"),
    `### ${t("betterUsTitle")}`,
    tc("verdictUs"),

    `## ${t("compareTitle")}`,
    t("compareSubtitle"),
    [
      `| | ${t("columnUs")} | ${comparison.name} |`,
      "| --- | --- | --- |",
      ...COMPARISON_ROWS.map((row) => `| ${t(`row_${row}`)} | ${cell(row).join(" | ")} |`),
    ].join("\n"),
    t("billingNote"),
    t("checkedNote", { date: reviewedDate }),
    `[${t("checkedDocsLink", { name: comparison.name })}](${comparison.docsUrl}) · [${t("checkedLink", { name: comparison.name })}](${comparison.pricingUrl})`,

    `## ${t("productTitle")}`,
    t("productSubtitle"),
    ...COMPARISON_FEATURES.flatMap(feature => [
      `### ${t(`feature_${feature}_title`)}`,
      t(`feature_${feature}_body`),
    ]),
    t("aiNote"),

    `## ${t("verdictTitle")}`,
    t("verdictSubtitle"),
    `### ${t("betterThemTitle", { name: comparison.name })}`,
    COMPARISON_POINTS.map((point) => `- ${tc(`betterThem_${point}`)}`).join("\n"),
    `### ${t("betterUsTitle")}`,
    COMPARISON_POINTS.map((point) => `- ${tc(`betterUs_${point}`)}`).join("\n"),

    `## ${t("migrationTitle")}`,
    t("migrationBody", { name: comparison.name }),
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
    header(t("metaTitle"), t("metaDescription"), canonical, locale),
    `${MARKDOWN_LOCALE_COPY[locale].fullHtml}: ${canonical}`,
    links(locale),
  ].join("\n\n") + "\n";
}

function links(locale: Locale): string {
  const copy = MARKDOWN_LOCALE_COPY[locale].links;
  const path = (key: PublicRouteKey) => {
    const route = routeByKey(key);
    return `${SITE_URL}${publicPathForLocale(route, locale)}`;
  };
  return [
    `## ${copy.title}`,
    `- ${copy.home}: ${path("home")}`,
    `- ${copy.pricing}: ${path("pricing")}`,
    `- ${copy.mcp}: ${path("mcp")}`,
    `- ${copy.selfHosting}: ${path("selfHosting")}`,
    `- ${copy.download}: ${path("download")}`,
    `- ${copy.repository}: ${MINDDY_REPOSITORY_URL}`,
    `- ${copy.changelog}: ${path("changelog")}`,
    `- ${copy.mcpGuide}: ${SITE_URL}/llms.txt`,
    `- ${copy.terms}: ${path("terms")}`,
    `- ${copy.privacy}: ${path("privacy")}`,
  ].join("\n");
}
