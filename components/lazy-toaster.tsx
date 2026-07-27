"use client";

import dynamic from "next/dynamic";

/**
 * Le `<Toaster>` de sonner, chargé paresseusement (MIN-100).
 *
 * Il est monté par le root layout, donc sur TOUTES les pages — y compris les six
 * pages publiques, qui n'affichent jamais de toast. Sonner et son conteneur
 * pesaient 12 Ko gzippés dans le bundle initial de la landing, devant l'image du
 * LCP dans la file de téléchargement.
 *
 * `ssr: false` sans risque de décalage : monté, le composant ne rend qu'une
 * région vide tant qu'aucun toast n'existe. Et un toast ne part jamais du premier
 * paint — il répond à une action, donc bien après l'hydratation.
 *
 * Un wrapper client est nécessaire : `next/dynamic` avec `ssr: false` n'est pas
 * autorisé dans un Server Component, et le root layout en est un.
 */
const Toaster = dynamic(
  () => import("mangue-ui/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function LazyToaster() {
  return <Toaster />;
}
