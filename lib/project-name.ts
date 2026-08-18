/**
 * Suggested project names — for anyone starting a project that doesn't yet exist
 * and doesn't have a name on hand. A code name, not an empty name: "Sirocco"
 * holds back, searches for itself and renames itself, "Project 1" does none of that.
 *
 * The list is UNIQUE, not translated, and that's intentional — same reason as the
 * pseudonyms of the public board (lib/feedback/pseudonym.ts): what comes out of here
 * is not copying, it is data. It is stored on the project and read
 * by the whole team, including by teammates who do not have the same
 * language as the one who clicked. The words retained are therefore written the same in
 * French and English, and are at least 4 letters long so that the suggested key
 * (`suggestKeyFromName`) is readable: “Quartz” → QUAR.
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
 * A random name, avoiding those that `isTaken` refuses — the caller puts this
 * that he knows: the projects already named like this, those whose key is taken, and the
 * name proposed just before (a proposition which falls on the same pass for
 * a dead button). If everything is refused, we still offer: a name already seen
 * is better than an empty field, and it remains modifiable.
 */
export function suggestProjectName(
  isTaken: (name: string) => boolean = () => false,
): string {
  const free = CODENAMES.filter((name) => !isTaken(name));
  const pool = free.length > 0 ? free : CODENAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
