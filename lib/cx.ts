/**
 * Le joint de classes des VUES de nœud tiptap — et la seule raison de ne pas
 * prendre `cn` de mangue-ui.
 *
 * Le baril `mangue-ui` tire le sélecteur d'emoji, donc `@emoji-mart/data` et son
 * JSON. Une vue de bloc qui l'importe rend le REGISTRE ENTIER inutilisable hors
 * navigateur — or la projection markdown (MIN-269), les outils MCP (MIN-273) et
 * lib/pages-blocks.test.ts montent tous le catalogue sans DOM ni bundler.
 *
 * `cn` sert à fusionner des classes Tailwind concurrentes ; ces vues n'en ont
 * pas besoin, elles ne font que joindre des conditions. Partout ailleurs dans
 * le dépôt — l'éditeur de page compris — c'est `cn` qu'on prend.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
