import type { Namespace } from "@/lib/i18n-keys";

import type { PublicRouteKey } from "@/lib/public-routes";

/**
 * The public comparison catalog: two closed-source products (Linear, Notion)
 * and three open-source ones (Plane, OpenProject, Taiga).
 * Compare documented workflows and billing models, acknowledge each product's
 * strengths, and keep current Minddy capabilities separate from competitor claims.
 * Each entry carries its own review date; refresh it only after checking that
 * entry's linked official sources.
 */

export interface Comparison {
  /** URL segment for `/alternatives/<slug>`. */
  slug: string;
  /** Proper name of the competitor — never translated, never in the i18n catalog. */
  name: string;
  /** Day its official sources were last checked, in short ISO. */
  reviewedAt: string;
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
    reviewedAt: "2026-09-05",
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
    slug: "notion",
    name: "Notion",
    reviewedAt: "2026-09-05",
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
  {
    slug: "plane",
    name: "Plane",
    reviewedAt: "2026-11-17",
    routeKey: "alternativePlane",
    namespace: "AlternativePlane",
    pricingUrl: "https://plane.so/pricing",
    docsUrl: "https://docs.plane.so",
    sources: {
      source: "https://developers.plane.so/self-hosting/editions-and-versions",
      teammate: "https://plane.so/pricing",
      agents: "https://docs.plane.so/ai/agents/overview",
      pages: "https://plane.so/pricing",
      feedback: "https://docs.plane.so/intake/overview",
      hosting: "https://developers.plane.so/self-hosting/editions-and-versions",
      setup: "https://docs.plane.so/introduction/core-concepts",
    },
  },
  {
    slug: "openproject",
    name: "OpenProject",
    reviewedAt: "2026-11-17",
    routeKey: "alternativeOpenProject",
    namespace: "AlternativeOpenProject",
    pricingUrl: "https://www.openproject.org/pricing/",
    docsUrl: "https://www.openproject.org/docs/",
    sources: {
      source: "https://www.openproject.org/docs/enterprise-guide/",
      teammate: "https://www.openproject.org/pricing/",
      agents: "https://www.openproject.org/docs/system-admin-guide/integrations/mcp-server/",
      pages: "https://www.openproject.org/docs/user-guide/",
      feedback: "https://www.openproject.org/docs/user-guide/forums/",
      hosting: "https://www.openproject.org/docs/installation-and-operations/installation/",
      setup: "https://www.openproject.org/docs/system-admin-guide/manage-work-packages/",
      builtFor: "https://www.openproject.org/",
    },
  },
  {
    slug: "taiga",
    name: "Taiga",
    reviewedAt: "2026-11-17",
    routeKey: "alternativeTaiga",
    namespace: "AlternativeTaiga",
    pricingUrl: "https://taiga.io/deployment-pricing-options/",
    docsUrl: "https://docs.taiga.io/",
    sources: {
      source: "https://github.com/taigaio/taiga-back",
      teammate: "https://taiga.io/deployment-pricing-options/",
      agents: "https://docs.taiga.io/",
      pages: "https://taiga.io/",
      feedback: "https://taiga.io/",
      hosting: "https://docs.taiga.io/setup-production.html",
      setup: "https://taiga.io/",
      builtFor: "https://taiga.io/",
    },
  },
] as const satisfies ReadonlyArray<Comparison>;

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

export type ComparisonFeature = (typeof COMPARISON_FEATURES)[number];

/**
 * The public guide that explains each feature in depth, by documentation ID.
 * Comparison pages link to these guides so their claims can be checked against
 * the manual. Features without a dedicated guide have no entry.
 */
export const COMPARISON_FEATURE_GUIDES = {
  agents: "minddy-mcp",
  numo: "numo",
  pages: "pages",
  routines: "scheduled-routines",
  planning: "objectives",
  feedback: "feedback",
} as const satisfies Partial<Record<ComparisonFeature, string>>;

export function comparisonBySlug(slug: string): Comparison | null {
  return COMPARISONS.find((entry) => entry.slug === slug) ?? null;
}
