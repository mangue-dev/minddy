import { PROTECTED_PREFIXES } from "@/lib/protected-prefixes";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt (MIN-73, supplemented by MIN-88).
 *
 * Written by hand rather than via `MetadataRoute.Robots`: the Next convention
 * can only issue `User-agent` / `Allow` / `Disallow` / `Sitemap`, but it
 * two things are missing here that it cannot produce — the line
 * `Content-Signal`, and groups per robot.
 *
 * Three decisions:
 *
 * 1. **Outside production, everything is prohibited.** `preview.minddy.app/robots.txt`
 * replied `Allow: /` on a complete site: a second minddy, indexable,
 * in direct competition with the real one on its own requests. THE
 * `X-Robots-Tag` of `next.config.mjs` complete, because a robots.txt does not
 * governs that DISCOVERY: an already known URL is visited anyway.
 *
 * 2. **AI bots are welcome** — explicitly, not by default.
 *    Ceux qui citent (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`…)
 * like those that result in (`GPTBot`, `ClaudeBot`, `Google-Extended`…).
 * A young app has nothing to protect and everything to gain from being known to
 * models; they were already passing, but nothing said so, and the absence of
 * explicit rule reads like an oversight.
 *
 * 3. **`Content-Signal`** (Cloudflare, September 2025) says the same thing in
 * the form that publishers are adopting: `search=yes`,
 * `ai-input=yes` (quote in an answer), `ai-train=yes`.
 *
 * The list of `Disallow` is DERIVED from `lib/protected-prefixes.ts`: this is the
 * same question asked twice ("what is private?"), it should not
 * not have two answers.
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

function group(userAgent: string, contentSignal?: string): string {
  const lines = [`User-agent: ${userAgent}`];
  if (contentSignal) lines.push(`Content-Signal: ${contentSignal}`);
  lines.push("Allow: /");
  lines.push(...DISALLOW.map((path) => `Disallow: ${path}`));
  return lines.join("\n");
}

export function GET(): Response {
  const isProduction = process.env.VERCEL_ENV === "production";
  const isVercelNonProduction = !!process.env.VERCEL_ENV && !isProduction;

  const body = isVercelNonProduction
    ? "User-agent: *\nDisallow: /\n"
    : [
        group("*", "search=yes, ai-input=yes, ai-train=yes"),
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
