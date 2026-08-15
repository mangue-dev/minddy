/**
 * L'ENVIRONNEMENT D'UN ENFANT DE LA COQUILLE (MIN-293) — la moitié qui se décide
 * sans process.
 *
 * ## Le piège, mesuré en vrai
 *
 * `utilityProcess.fork` **refuse un `env` dont une valeur n'est pas une chaîne**,
 * et il le dit d'une façon qui ne désigne rien : `TypeError: Invalid value for
 * env`. Pas le nom de la clé, pas la valeur. Retirer une variable en écrivant
 * `{ ...process.env, NODE_OPTIONS: undefined }` — la forme naturelle, celle qui
 * marche avec `child_process.spawn` — fait donc tomber le fork **avant** que le
 * harness ait démarré, c'est-à-dire à l'endroit exact où il n'y a encore ni event,
 * ni checkpoint, ni journal de tour.
 *
 * D'où ce module : **on RETIRE la clé, on ne la met pas à `undefined`**, et on
 * filtre tout ce qui ne serait pas une chaîne. Une ligne, mais c'est le genre de
 * ligne qui coûte une session de débogage la deuxième fois.
 *
 * ## Ce qu'un enfant n'hérite pas, et pourquoi
 *
 * Le harness est un bundle Node ordinaire, et `npm` est un programme ordinaire :
 * ni l'un ni l'autre n'a à recevoir ce qu'Electron pose pour ses propres process
 * fils, ni ce qu'un éditeur a laissé traîner dans le terminal qui a lancé l'app.
 *
 * - **`ELECTRON_RUN_AS_NODE`** — **VS Code le met dans l'environnement de tout ce
 *   qu'il lance**, terminal intégré compris. Le dépôt le sait déjà et le retire
 *   pour lancer Electron ([scripts/dev-desktop.mjs](../../scripts/dev-desktop.mjs)) ;
 *   c'est le même piège une couche plus bas.
 * - **`NODE_OPTIONS`** — `npm run dev` de ce dépôt en pose un
 *   (`--max-http-header-size=32768`). Il n'a aucun sens pour le harness, et un
 *   drapeau inconnu d'une autre version de Node le ferait mourir au démarrage
 *   avec un message qui ne parle de rien de ce qu'on vient de changer.
 */

/**
 * Ce qu'un enfant de la coquille n'hérite jamais. Fermée volontairement : une
 * variable retirée « au cas où » est une variable que personne ne remet ensuite.
 */
export const NOT_INHERITED: readonly string[] = ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"];

/**
 * L'environnement d'un enfant : celui du parent, moins ce qui ne se transmet pas,
 * et **rien que des chaînes**.
 *
 * `drop` s'ajoute à `NOT_INHERITED` plutôt que de le remplacer — un appelant qui
 * veut retirer une variable de plus ne doit pas pouvoir réintroduire les deux
 * autres en oubliant de les recopier.
 */
export function childEnv(
  parent: Readonly<Record<string, string | undefined>>,
  drop: readonly string[] = [],
): Record<string, string> {
  const forbidden = new Set([...NOT_INHERITED, ...drop]);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (forbidden.has(key)) continue;
    // La garde qui compte : `utilityProcess.fork` lève sur toute valeur qui n'est
    // pas une chaîne, et son message ne nomme pas la clé fautive.
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}
