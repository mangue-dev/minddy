import type { Namespace } from "@/lib/i18n-keys";

import type { PublicRouteKey } from "@/lib/public-routes";

/**
 * The public comparison catalog for Linear, Jira, and Notion.
 * Compare documented workflows and billing models, acknowledge each product's
 * strengths, and keep current Minddy capabilities separate from competitor claims.
 * Refresh the review date only after checking the linked official sources.
 */
export const COMPARISON_REVIEWED_AT = "2026-09-05";

export interface Comparison {
  /** URL segment for `/alternatives/<slug>`. */
  slug: string;
  /** Proper name of the competitor — never translated, never in the i18n catalog. */
  name: string;
  /** `lib/public-routes.ts` entry that serves this page. */
  routeKey: PublicRouteKey;
  /** Namespace i18n of texts specific to this comparison. */
  namespace: Namespace;
  /** Its public pricing page: the reader should be able to check for themselves. */
  pricingUrl: string;
  /** Its official product documentation, used to substantiate feature claims. */
  docsUrl: string;
  /** Official evidence for the corresponding comparison row. */
  sources: Partial<Record<ComparisonRow, string>>;
}

export const COMPARISONS = [
  {
    slug: "linear",
    name: "Linear",
    routeKey: "alternativeLinear",
    namespace: "AlternativeLinear",
    pricingUrl: "https://linear.app/pricing",
    docsUrl: "https://linear.app/docs",
    sources: {
      teammate: "https://linear.app/pricing",
      agents: "https://linear.app/docs/coding-sessions",
      pages: "https://linear.app/docs/default-team-pages",
      feedback: "https://linear.app/docs/customer-requests",
      setup: "https://linear.app/docs/conceptual-model",
      builtFor: "https://linear.app/docs/initiatives",
    },
  },
  {
    slug: "jira",
    name: "Jira",
    routeKey: "alternativeJira",
    namespace: "AlternativeJira",
    pricingUrl: "https://www.atlassian.com/software/jira/pricing",
    docsUrl: "https://support.atlassian.com/jira-software-cloud/",
    sources: {
      teammate: "https://support.atlassian.com/subscriptions-and-billing/docs/manage-users-and-user-tiers/",
      agents: "https://www.atlassian.com/platform/rovo-mcp",
      pages: "https://support.atlassian.com/confluence-cloud/docs/create-and-edit-content/",
      feedback: "https://support.atlassian.com/jira-product-discovery/docs/create-and-manage-insights/",
      hosting: "https://www.atlassian.com/licensing/data-center-end-of-life",
      setup: "https://support.atlassian.com/jira-software-cloud/docs/what-are-jira-workflows/",
    },
  },
  {
    slug: "notion",
    name: "Notion",
    routeKey: "alternativeNotion",
    namespace: "AlternativeNotion",
    pricingUrl: "https://www.notion.com/pricing",
    docsUrl: "https://www.notion.com/help",
    sources: {
      teammate: "https://www.notion.com/help/add-members-admins-guests-and-groups",
      agents: "https://www.notion.com/help/mcp-connections-for-custom-agents",
      pages: "https://www.notion.com/help/guides/getting-started-with-projects-and-tasks",
      feedback: "https://www.notion.com/pricing",
      setup: "https://www.notion.com/help/guides/getting-started-with-projects-and-tasks",
    },
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
  "source",
  "teammate",
  "agents",
  "pages",
  "feedback",
  "hosting",
  "setup",
  "builtFor",
] as const;

export type ComparisonRow = (typeof COMPARISON_ROWS)[number];

/** The three arguments of each column of prose, on both sides. */
export const COMPARISON_POINTS = [1, 2, 3] as const;

/** Current minddy capabilities that deserve more than one table cell. */
export const COMPARISON_FEATURES = [
  "agents",
  "pages",
  "numo",
  "routines",
  "planning",
  "feedback",
  "capture",
  "openSource",
] as const;

export function comparisonBySlug(slug: string): Comparison | null {
  return COMPARISONS.find((entry) => entry.slug === slug) ?? null;
}
