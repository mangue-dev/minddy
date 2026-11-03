import { PROTECTED_PREFIXES } from "@/lib/protected-prefixes";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt (MIN-73, supplemented by MIN-88).
 *
 * Written by hand rather than via `MetadataRoute.Robots`: the Next convention
 * can only issue `User-agent` / `Allow` / `Disallow` / `Sitemap`, and it cannot
 * produce one group per robot or the comment that states our content signals.
 *
 * Three decisions:
 *
 * 1. **Outside production, everything is prohibited.** `preview.minddy.app/robots.txt`
 *    replied `Allow: /` on a complete site: a second minddy, indexable, in
 *    direct competition with the real one on its own queries. The
 *    `X-Robots-Tag` of `next.config.mjs` completes it, because robots.txt only
 *    governs discovery: an already known URL is visited anyway.
 *
 * 2. **AI bots are welcome**, explicitly rather than by default. Bots that
 *    quote pages in an answer (`OAI-SearchBot`, `Claude-SearchBot`,
 *    `PerplexityBot`…) and bots that collect training data (`GPTBot`,
 *    `ClaudeBot`, `Google-Extended`…) each get their own group. A young app has
 *    nothing to protect and everything to gain from being known to models, and
 *    an absent rule reads like an oversight.
 *
 * 3. **Content signals are a comment, not a directive.** Cloudflare's
 *    `Content-Signal` line (September 2025) said the same thing as decision 2
 *    (`search=yes, ai-input=yes, ai-train=yes`), but Google Search Console
 *    reports it as a rule Googlebot ignores. Every value was `yes`,
 *    which is also what the explicit groups grant, so the comment keeps the
 *    statement for human readers without a warning in Search Console.
 *
 * The list of `Disallow` is DERIVED from `lib/protected-prefixes.ts`: this is the
 * same question asked twice ("what is private?"), and it should not have two
 * answers.
 */

/** Robots that quote pages in a response, and classic engines. */
const CITATION_BOTS = [
  "Googlebot",
  "Bingbot",
  "Applebot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
];

/** Collection robots for model training. */
const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"];

const DISALLOW = [
  "/api/",
  "/auth/",
  // SSO redirection to the feedback board: a redirection, not a page.
  "/feedback",
  // Shared views, public boards and published pages: the URL IS the secret
  // (MIN-26, MIN-37, MIN-283).
  "/share/",
  "/f/",
  "/p/",
  // Without trailing bar: a `Disallow` is a literal prefix, `/projects`
  // therefore covers `/projects` AND `/projects/<id>/board`. The counterpart is
  // that it would also cover a future public page whose URL would begin
  // by these letters — to watch if the site gains a `/agents-pour-jira`.
  ...PROTECTED_PREFIXES,
];

/** Our content-usage preferences, for people; see decision 3 above. */
const CONTENT_SIGNALS = "# Content signals: search=yes, ai-input=yes, ai-train=yes";

function group(userAgent: string): string {
  return [`User-agent: ${userAgent}`, "Allow: /", ...DISALLOW.map((path) => `Disallow: ${path}`)].join("\n");
}

export function GET(): Response {
  const isProduction = process.env.VERCEL_ENV === "production";
  const isVercelNonProduction = !!process.env.VERCEL_ENV && !isProduction;

  const body = isVercelNonProduction
    ? "User-agent: *\nDisallow: /\n"
    : [
        CONTENT_SIGNALS,
        group("*"),
        ...CITATION_BOTS.map((bot) => group(bot)),
        ...TRAINING_BOTS.map((bot) => group(bot)),
        `Sitemap: ${SITE_URL}/sitemap.xml`,
      ].join("\n\n") + "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
