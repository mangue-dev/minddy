/**
 * Ce que le catalogue de traduction envoie au NAVIGATEUR sur le site public
 * (MIN-100).
 *
 * `NextIntlClientProvider` reçoit ses messages en props. Une prop de composant
 * client traverse la frontière serveur → client, donc elle est SÉRIALISÉE dans
 * le flux RSC inline du document. Le root layout lui passait `getMessages()`,
 * c'est-à-dire les 67 namespaces de `messages/<locale>.json` : mesuré sur la
 * landing, **123,6 Ko bruts / 39 Ko gzippés — 51 % de la charge RSC et 44 % du
 * document entier** — pour livrer au visiteur d'une page marketing les libellés
 * du bloc-notes, de l'inbox, de la facturation et du tableau d'administration.
 *
 * Sur une page dont le LCP est une image qui attend derrière la file de
 * téléchargement, ces octets-là passent AVANT elle. C'était le premier poste du
 * budget, loin devant les frontières clientes des animations (13,9 Ko bruts à
 * elles toutes, cf. le commentaire de `components/marketing/reveal.tsx`).
 *
 * Les six pages publiques (et la 404, qui rend le même chrome) n'ont besoin que
 * de ces quatre namespaces. Tout le reste — app authentifiée, écrans de
 * connexion, boards de feedback, vues partagées — reçoit le catalogue complet
 * depuis son propre segment, via `components/full-catalog-messages.tsx`.
 *
 * ## Le root layout ne choisit pas selon la route
 *
 * Il l'a fait, et c'était un bug : un layout partagé n'est pas re-rendu lors
 * d'une navigation cliente, donc `/login` atteinte depuis la landing héritait
 * des quatre namespaces ci-dessous et affichait « Auth.signIn ». Ce qui sort du
 * root layout doit être vrai sur TOUTES les routes ; le supplément se monte plus
 * bas, là où le segment change vraiment.
 *
 * ## Tenu à jour par un test, pas à la main
 *
 * `public-client-messages.test.ts` part de `app/layout.tsx`, de `not-found.tsx`
 * et des layouts `(marketing)` / `(legal)`, suit les imports, et vérifie que tout
 * `useTranslations("X")` trouvé dans un composant CLIENT atteignable a bien son
 * `X` dans la liste ci-dessous. Ajouter un composant client au site public qui
 * traduit dans un namespace absent fait donc échouer `npm run test`, et non la
 * page en production. Un second test vérifie que les segments à catalogue
 * complet montent bien leur provider.
 */

/** Namespaces servis aux composants clients des six pages publiques. */
export const PUBLIC_CLIENT_NAMESPACES = [
  // Le bandeau cookies, monté par le root layout donc présent partout.
  "CookieBanner",
  // La nav, son menu produit, le pied de page, les plans de la page tarifs.
  "Landing",
  // Le sélecteur de langue du pied de page.
  "Language",
  // Les intitulés de plan et de quota, partagés avec les réglages de
  // facturation de l'app (`components/marketing/pricing-plans.tsx`).
  "Billing",
] as const;

/**
 * Le catalogue réduit aux namespaces du site public. Un namespace absent du
 * catalogue est ignoré silencieusement : le test ci-contre est le garde-fou, ce
 * n'est pas à une fonction appelée à chaque requête de le devenir.
 */
export function publicClientMessages<T extends Record<string, unknown>>(
  messages: T,
): Partial<T> {
  const scoped: Partial<T> = {};
  for (const namespace of PUBLIC_CLIENT_NAMESPACES) {
    const key = namespace as keyof T;
    if (key in messages) scoped[key] = messages[key];
  }
  return scoped;
}
