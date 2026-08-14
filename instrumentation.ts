/**
 * `register()` — appelé une fois par instance de serveur, avant la première
 * requête (cf. node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 *
 * Ce qu'on y fait : contrôler les secrets d'environnement qui servent de clé
 * (MIN-347). Lever ici, c'est refuser de démarrer — et c'est exactement ce
 * qu'on veut d'une clé de chiffrement vide ou d'un HMAC de trois caractères :
 * l'alternative est un déploiement qui tourne, qui chiffre, et dont personne
 * n'apprend rien avant l'incident.
 *
 * Runtime Node uniquement : `instrumentation.ts` est aussi chargé côté edge, où
 * `server-only` et `node:crypto` n'ont rien à faire. Le proxy, lui, ne touche à
 * aucun de ces secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSecretsAreStrong } = await import("@/lib/server/env-secrets");
  assertSecretsAreStrong();
}
