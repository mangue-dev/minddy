import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * LE BUNDLE DU HARNESS DE LA MICROVM (MIN-224).
 *
 * Un seul fichier JS, écrit dans la microVM par `writeFiles` au démarrage de
 * chaque tour et lancé par `node`. Pourquoi un bundle plutôt qu'un dossier :
 * la VM n'a pas nos `node_modules`, et on ne va pas y faire un `npm install` du
 * dépôt de minddy avant chaque tour. esbuild aplatit tout ce que le harness
 * touche en un fichier, et ce fichier ne dépend plus que de Node.
 *
 * CE QUI DOIT RESTER VRAI, et un test le tient
 * ([vm-bundle-secrets.test.ts](../lib/server/agent/vm-bundle-secrets.test.ts)) :
 * **rien de ce qui part ici ne doit pouvoir atteindre un secret** — ni le client
 * Supabase en clé de service, ni `OPENROUTER_API_KEY`. La microVM est l'endroit
 * où le modèle exécute du shell arbitraire ; un `env` y suffirait. Le test lit le
 * graphe d'imports depuis LE MÊME point d'entrée que ce script, et c'est
 * volontaire : deux listes écrites à la main auraient fini par diverger, et le
 * garde-fou aurait alors gardé un bundle qu'on ne livre plus.
 *
 * `platform: node` et `format: cjs` : le bundle tourne sous le Node de la microVM
 * (`node24`), pas dans un navigateur ni sous Next. `packages: bundle` est le
 * défaut — c'est exactement ce qu'on veut, tout doit entrer.
 *
 * ⚠ **Câblé sur `prebuild` ET sur `predev`, et le second a manqué longtemps.**
 * `next dev` ne construit rien : le bundle lu par `vm-launch.ts` restait celui
 * du dernier build à la main, et un tour lancé en local jouait donc un harness
 * d'un autre jour. Depuis MIN-354 un décalage de PROTOCOLE se dit (« the harness
 * bundle is out of date ») ; toute autre modification du harness, elle, se
 * jouait en silence avec l'ancien code. Il coûte 20 ms.
 *
 * Ça ne couvre que le DÉMARRAGE du serveur de dév : modifier
 * `lib/server/agent/vm/` pendant qu'il tourne demande encore de relancer ce
 * script à la main. Le sachant, c'est un réflexe ; sans ça, c'était un piège.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * Où le bundle atterrit. HORS de `lib/`, pour que ni `tsc` ni vitest ne le
 * ramassent, et sous un dossier à part pour que `outputFileTracingIncludes`
 * (next.config.mjs) puisse l'embarquer dans les fonctions d'un seul motif.
 */
const OUT_DIR = path.join(repo, ".agent-vm");
const OUT_FILE = path.join(OUT_DIR, "main.js");

/**
 * Plafond de taille, et il n'est pas cosmétique : le bundle est écrit dans la
 * microVM à CHAQUE tour, et il voyage dans le corps d'un appel à l'API Sandbox.
 * Un module lourd tiré par mégarde (un SDK, un pack d'icônes, une locale
 * complète) se verrait d'abord ici. Généreux pour ne pas gêner, ferme pour que
 * l'accident se dise.
 */
const MAX_BUNDLE_BYTES = 4_000_000;

await mkdir(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [path.join(repo, "lib/server/agent/vm/main.ts")],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // Pas de minification : quand un tour casse dans la VM, la pile d'appel est la
  // seule chose qu'on ait. Elle doit se lire.
  minify: false,
  sourcemap: false,
  // Les alias `@/…` du dépôt. esbuild les lit du tsconfig, mais on le lui dit
  // explicitement : le fichier compte deux `paths` et un oubli se traduirait par
  // un « Could not resolve » au build, jamais en production.
  tsconfig: path.join(repo, "tsconfig.json"),
  // `server-only` lève à l'import hors d'un contexte serveur React. Aucun module
  // du bundle ne devrait l'importer (ils ont tous été nettoyés), mais s'il en
  // restait un, mieux vaut un stub qu'un crash au démarrage de la VM.
  alias: { "server-only": path.join(dir, "agent-vm-server-only-stub.js") },
  logLevel: "info",
  metafile: true,
});

const { size } = await stat(OUT_FILE);
if (size > MAX_BUNDLE_BYTES) {
  // Les cinq plus gros contributeurs : sans eux, « le bundle a doublé » n'est pas
  // actionnable. Avec eux, on lit tout de suite ce qui est entré par erreur.
  const inputs = Object.entries(result.metafile.outputs[path.relative(repo, OUT_FILE)]?.inputs ?? {})
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
    .slice(0, 5)
    .map(([file, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${file}`)
    .join("\n");
  console.error(
    `[build:agent-vm] le bundle fait ${(size / 1_000_000).toFixed(2)} Mo, au-dessus du plafond de ${(MAX_BUNDLE_BYTES / 1_000_000).toFixed(1)} Mo.\nLes plus gros contributeurs :\n${inputs}`,
  );
  process.exit(1);
}

console.log(
  `[build:agent-vm] ${path.relative(repo, OUT_FILE)} — ${(size / 1024).toFixed(0)} Ko`,
);
