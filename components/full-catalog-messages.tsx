import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Sert le catalogue i18n COMPLET au sous-arbre client d'un segment (MIN-100).
 *
 * Le root layout n'envoie au navigateur que les quatre namespaces du site
 * public (`lib/public-client-messages.ts`), et il les envoie **toujours** — voir
 * `app/layout.tsx` pour la raison. Tout segment dont les composants clients
 * traduisent ailleurs que dans ces quatre-là monte donc ce provider : l'app
 * authentifiée, l'écran de connexion, les boards de feedback publics et les vues
 * partagées.
 *
 * `NextIntlClientProvider` REMPLACE les messages hérités, il ne les complète
 * pas : ce provider doit contenir tout ce que son sous-arbre traduit. Le
 * catalogue entier est donc la valeur sûre — c'est déjà ce que ces pages
 * recevaient avant.
 */
export async function FullCatalogMessages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider messages={await getMessages()}>{children}</NextIntlClientProvider>;
}
