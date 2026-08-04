/**
 * Noms de projet proposés — pour qui démarre un projet qui n'existe pas encore
 * et n'a pas de nom sous la main. Un nom de code, pas un nom vide : « Sirocco »
 * se retient, se cherche et se renomme, « Projet 1 » ne fait rien de tout ça.
 *
 * La liste est UNIQUE, pas traduite, et c'est voulu — même raison que les
 * pseudonymes du board public (lib/feedback/pseudonym.ts) : ce qui sort d'ici
 * n'est pas de la copy, c'est une donnée. Elle est stockée sur le projet et lue
 * par toute l'équipe, y compris par les coéquipiers qui n'ont pas la même
 * langue que celui qui a cliqué. Les mots retenus s'écrivent donc pareil en
 * français et en anglais, et font au moins 4 lettres pour que la clé suggérée
 * (`suggestKeyFromName`) soit lisible : « Quartz » → QUAR.
 */

const CODENAMES = [
  "Altair", "Antares", "Apex", "Atlas", "Atoll", "Bonsai", "Canyon", "Cirrus",
  "Cobalt", "Cosmos", "Cumulus", "Delta", "Denali", "Everest", "Fjord", "Fuji",
  "Gamma", "Halo", "Indigo", "Jade", "Kappa", "Lambda", "Lapis", "Laser",
  "Lotus", "Lumen", "Magma", "Mesa", "Mistral", "Nova", "Oasis", "Omega",
  "Onyx", "Orion", "Pixel", "Polaris", "Pulsar", "Pyrite", "Quartz", "Quasar",
  "Radar", "Rigel", "Sahara", "Sigma", "Silex", "Sirius", "Sirocco", "Solstice",
  "Sonar", "Steppe", "Stratus", "Titan", "Tundra", "Vega", "Vertex", "Vortex",
] as const;

/**
 * Un nom au hasard, en évitant ceux que `isTaken` refuse — l'appelant y met ce
 * qu'il sait : les projets déjà nommés ainsi, ceux dont la clé est prise, et le
 * nom proposé juste avant (une proposition qui retombe sur la même passe pour
 * un bouton mort). Si tout est refusé, on propose quand même : un nom déjà vu
 * vaut mieux qu'un champ vide, et il reste modifiable.
 */
export function suggestProjectName(
  isTaken: (name: string) => boolean = () => false,
): string {
  const free = CODENAMES.filter((name) => !isTaken(name));
  const pool = free.length > 0 ? free : CODENAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
