import { PROTECTED_PREFIXES } from "@/lib/protected-prefixes";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt (MIN-73, complété par MIN-88).
 *
 * Écrit à la main plutôt que via `MetadataRoute.Robots` : la convention de Next
 * ne sait émettre que `User-agent` / `Allow` / `Disallow` / `Sitemap`, or il
 * manque ici deux choses qu'elle ne peut pas produire — la ligne
 * `Content-Signal`, et des groupes par robot.
 *
 * Trois décisions :
 *
 * 1. **Hors production, tout est interdit.** `preview.minddy.app/robots.txt`
 *    répondait `Allow: /` sur un site complet : un deuxième minddy, indexable,
 *    en concurrence directe avec le vrai sur ses propres requêtes. Le
 *    `X-Robots-Tag` de `next.config.mjs` complète, parce qu'un robots.txt ne
 *    gouverne que la DÉCOUVERTE : une URL déjà connue est visitée quand même.
 *
 * 2. **Les robots d'IA sont les bienvenus** — explicitement, pas par défaut.
 *    Ceux qui citent (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`…)
 *    comme ceux qui entraînent (`GPTBot`, `ClaudeBot`, `Google-Extended`…).
 *    Une jeune app n'a rien à protéger et tout à gagner à être connue des
 *    modèles ; ils passaient déjà, mais rien ne le disait, et l'absence de
 *    règle explicite se lit comme un oubli.
 *
 * 3. **`Content-Signal`** (Cloudflare, septembre 2025) dit la même chose dans
 *    la forme que les éditeurs sont en train d'adopter : `search=yes`,
 *    `ai-input=yes` (citation dans une réponse), `ai-train=yes`.
 *
 * La liste des `Disallow` est DÉRIVÉE de `lib/protected-prefixes.ts` : c'est la
 * même question posée deux fois (« qu'est-ce qui est privé ? »), elle ne doit
 * pas avoir deux réponses.
 */

/** Robots qui citent des pages dans une réponse, et moteurs classiques. */
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

/** Robots de collecte pour l'entraînement des modèles. */
const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"];

const DISALLOW = [
  "/api/",
  "/auth/",
  // Redirection SSO vers le board de feedback : une redirection, pas une page.
  "/feedback",
  // Vues partagées et boards publics : l'URL EST le secret (MIN-26, MIN-37).
  "/share/",
  "/f/",
  // Sans barre finale : un `Disallow` est un préfixe littéral, `/projects`
  // couvre donc `/projects` ET `/projects/<id>/board`. La contrepartie est
  // qu'il couvrirait aussi une future page publique dont l'URL commencerait
  // par ces lettres — à surveiller si le site gagne un `/agents-pour-jira`.
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
