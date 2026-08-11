import packageJson from "@/package.json";

/**
 * La version telle qu'elle se lit : `0.8.9` posée sur son tag, `0.8.9-3` trois
 * commits plus loin.
 *
 * Le nombre se lit sans mode d'emploi — c'est tout ce qu'on lui demande. Une
 * lettre (A, B, C… AA, AB) tenait plus court, mais il fallait savoir la
 * décoder, et un indicateur qu'on doit décoder n'indique rien.
 *
 * 0 (ou une valeur qui n'est pas un entier positif) ne rend rien : le
 * déploiement est POSÉ sur sa version, il n'y a rien à ajouter derrière.
 */
export function formatAppVersion(version: string, count: number): string {
  if (!Number.isFinite(count)) return version;
  const n = Math.floor(count);
  return n > 0 ? `${version}-${n}` : version;
}

/**
 * La version telle qu'elle s'affiche dans le menu de compte.
 *
 * `NEXT_PUBLIC_VERSION_COMMITS` est inliné au build par `next.config.mjs`
 * (voir `scripts/commits-since-version.mjs` pour la mesure et sa condition :
 * `VERCEL_DEEP_CLONE=1` sur Vercel). Absente ou illisible → version nue.
 */
export const APP_VERSION = formatAppVersion(
  packageJson.version,
  Number(process.env.NEXT_PUBLIC_VERSION_COMMITS ?? "0")
);
