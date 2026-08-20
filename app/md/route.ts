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
 * **Why.** An agent who wants to read a page today pays for 440 KB of HTML
 * to extract 4 KB of text, and must guess the structure along the way. THE
 * Markdown gives it the same content, hierarchical, without a byte of markup
 * useless. This is one of the points that Cloudflare's agentic auditor notes, and
 * the only one on his list that costs anything to produce.
 *
 * **Which it is not.** Not a byte-for-byte mirror of HTML. The content
 * is rebuilt from THE SAME i18n KEYS as the components — so it does not
 * cannot tell anything other than the page - but the order and grouping
 * are rewritten for a reader who reads text, not layout. THE
 * four legal pages return their title, their description and a link: their
 * body is structured prose in JSX, rewriting it here would make it
 * second source of legal truth, which we do not want at any price.
 */

const KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

/** The comparisons, found by the route key that the proxy gives us. */
const COMPARISON_BY_ROUTE = new Map<string, Comparison>(
  COMPARISONS.map((comparison) => [comparison.routeKey, comparison]),
);

/**
 * Which page to render, and in what language — read in the HEADERS set by the
 * proxy, with the query as a backup.
 *
 * The proxy passed the information into query (`/md?route=pricing&locale=fr`).
 * It didn't happen: on a middleware rewrite, Next 16 gives the
 * route handler the ORIGINAL URL (`request.nextUrl` and `request.url` are equal
 * `/pricing`), not the target. `route` was therefore still absent, `/md` fell
 * on its default, and ALL pages of the site served the Markdown of the
 * landing — measured by building the Markdown version of MIN-93 pages.
 *
 * The request headers go through the rewriting: it's already there
 * que `x-minddy-locale` atteint `i18n/request.ts`.
 *
 * The query remains read second so that `/md?route=…&locale=…` continues to
 * operate in direct call — this is what you type to check a page.
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
  else if (key === "selfHosting") body = await renderSelfHosting(locale, canonical);
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
    // Prices come from BILLING_PLANS, never from a copy — same rule as
    // structured data.
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
  const operations = ["backup", "update", "diagnose"] as const;

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    `## ${t("howTitle")}`,
    t("howBody"),
    foundations
      .map((key) => `- **${t(`foundation_${key}_title`)}**: ${t(`foundation_${key}_body`)}`)
      .join("\n"),
    `> ${t("howBoundary")}`,
    `## ${t("localTitle")}`,
    t("localGuideBody"),
    `> ${t("localBoundary")}`,
    `### ${t("stepInstallLocalTitle")}`,
    t("stepInstallLocalBody"),
    "```bash\ncorepack enable\ncorepack prepare pnpm@10.28.0 --activate\npnpm install --frozen-lockfile\npnpm self-host:local\n```",
    `### ${t("stepOpenLocalTitle")}`,
    t("stepOpenLocalBody"),
    `- **${t("macAppTitle")}**: ${t("macLocalBody")}`,
    `- **${t("browserTitle")}**: ${t("browserLocalBody")}`,
    `## ${t("teamTitle")}`,
    t("teamGuideBody"),
    `> ${t("teamBoundary")}`,
    `1. **${t("stepPrepareServerTitle")}** — ${t("stepPrepareServerBody")}`,
    `2. **${t("stepGetReleaseTitle")}** — ${t("stepGetReleaseBody", { release: "…" })}`,
    `3. **${t("stepRunInstallerTitle")}** — ${t("stepRunInstallerBody")}`,
    `4. **${t("stepEmailTitle")}** — ${t("stepEmailManagedBody")}`,
    `5. **${t("stepVerifyServerTitle")}** — ${t("stepVerifyServerBody")}`,
    `6. **${t("stepSignupServerTitle")}** — ${t("stepSignupServerBody")}`,
    `## ${t("operationsTitle")}`,
    t("operationsSubtitle"),
    operations
      .map((key) => `- **${t(`operation_${key}_title`)}**: ${t(`operation_${key}_body`)}`)
      .join("\n"),
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
 * A comparison in Markdown (MIN-93). HTML table becomes a real table
 * Markdown: this is the form that a model copies without making a mistake in the column, and
 * the only reason a text version of this page is of interest.
 *
 * The order of the page is preserved — what the other tool does better comes
 * BEFORE what minddy does otherwise. A text version that would reverse the
 * two would not say the same thing as the page it claims to reflect.
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
    `- Self-hosting guide: ${path("selfHosting")}`,
    `- Repository: ${MINDDY_REPOSITORY_URL}`,
    `- Changelog: ${path("changelog")}`,
    `- MCP integration guide: ${SITE_URL}/llms.txt`,
    `- Terms: ${path("terms")}`,
    `- Privacy: ${path("privacy")}`,
  ].join("\n");
}
