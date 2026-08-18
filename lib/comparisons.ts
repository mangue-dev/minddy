import type { Namespace } from "@/lib/i18n-keys";

import type { PublicRouteKey } from "@/lib/public-routes";

/**
 * Pages `/alternatives/<outil>` (MIN-93) — a comparison by competitor.
 *
 * ## How these three were chosen
 *
 * The plan required deciding on data: the PostHog and the
 * responses from the feedback board. Recorded on July 27, 2026, there are none —
 * 12 external page views for 10 people since tracking was put into service,
 * and only one feedback post, internal. A “data-driven” choice on
 * twelve visits would be a decoration.
 *
 * For lack of anything better, we therefore use the three tools that the product description
 * already names (`Landing.metaDescription` says “simple alternative to Linear or
 * Jira”) and which bring the search volume to “alternative to X”. TO
 * redo when traffic says something.
 *
 * ## What is compared, and what is not
 *
 * Only four lines: what a colleague costs, what code agents
 * do there, what which must be configured before writing a ticket, and for whom
 * the tool is made. No list of functions, no copied price, no cross
 * on a competitor's product.
 *
 * This is deliberate. A table of thirty crosses is out of date in the following quarter, and
 * it only takes ONE false cross for a reader who knows the other tool
 * to stop believing the rest of the page - therefore also the models, which cite in priority the sources which recognize their limits. Each page says
 * first of all what the other does better.
 *
 * ## The two mistakes not to make
 *
 * **No, minddy is not “a package for the whole team”.** The first
 * version of these pages wrote it, and it was wrong: the owner pays the limits
 * of HIS projects, but each keeps its own plan for the IA functions
 * (`lib/server/entitlements.ts`: "a structural limit is verified on the
 * plan of the OWNER; an AI action is paid on the level of its ACTOR"). Which is
 * true, and that's already a difference: a colleague who comes to follow tickets
 * does not cost an extra seat.
 *
 * **No, minddy is not the only one talking about MCP.** Linear publishes
 * `mcp.linear.app/mcp`, Atlassian its Rovo server in OAuth 2.1, Notion le
 * its own. The tenable difference is finer: at Minddy the ticket carries its
 * plan, and the agent checks it as the work progresses.
 */

export interface Comparison {
  /** Segment d'URL : `/alternatives/<slug>`. */
  slug: string;
  /** Proper name of the competitor — never translated, never in the i18n catalog. */
  name: string;
  /** `lib/public-routes.ts` entry that serves this page. */
  routeKey: PublicRouteKey;
  /** Namespace i18n of texts specific to this comparison. */
  namespace: Namespace;
  /** Its public pricing page: the reader should be able to check for themselves. */
  pricingUrl: string;
}

export const COMPARISONS = [
  {
    slug: "linear",
    name: "Linear",
    routeKey: "alternativeLinear",
    namespace: "AlternativeLinear",
    pricingUrl: "https://linear.app/pricing",
  },
  {
    slug: "jira",
    name: "Jira",
    routeKey: "alternativeJira",
    namespace: "AlternativeJira",
    pricingUrl: "https://www.atlassian.com/software/jira/pricing",
  },
  {
    slug: "notion",
    name: "Notion",
    routeKey: "alternativeNotion",
    namespace: "AlternativeNotion",
    pricingUrl: "https://www.notion.com/pricing",
  },
] as const satisfies ReadonlyArray<Comparison>;

export type ComparisonSlug = (typeof COMPARISONS)[number]["slug"];

/**
 * The table rows, in order. i18n keys: `Alternatives.row_<key>` for
 * the label, `Alternatives.minddy_<key>` for minddy's cell, and
 * `<competitorNamespace>.them_<key>` for theirs.
 *
 * Only TEXT cells, no checkboxes: a cross in a competitor's
 * column reads like an accusation, and asks one to be sure of an absent
 * — which one cannot be.
 */
export const COMPARISON_ROWS = [
  "teammate",
  "agents",
  "setup",
  "builtFor",
] as const;

export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

/** The three arguments of each column of prose, on both sides. */
export const COMPARISON_POINTS = [1, 2, 3] as const;

export function comparisonBySlug(slug: string): Comparison | null {
  return COMPARISONS.find((entry) => entry.slug === slug) ?? null;
}
