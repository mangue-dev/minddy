import { build } from "esbuild";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * LE BUNDLE DE LA COQUILLE ELECTRON (MIN-291).
 *
 * Deux fichiers, et deux seulement : le main process et le preload. Ils
 * importent de `lib/desktop/` (la garde de navigation, le parsing du deep link,
 * le contrat du pont), qui est du TypeScript du dépôt avec ses alias `@/…` — un
 * bundle est donc le moyen le plus court d'obtenir du JS qu'Electron charge tel
 * quel, sans `node_modules` à installer dans l'app.
 *
 * Le preload est bundlé **en CJS et sans `sandbox: false`** : dans un renderer
 * en `sandbox: true`, Electron charge le preload dans un contexte restreint qui
 * ne connaît que `require('electron')` et quelques modules — pas d'ESM, pas de
 * `node_modules`. Tout ce qu'il touche doit donc être DANS le fichier.
 *
 * Rien de ce qui est bundlé ici ne doit tirer de React, de Next ou de code
 * serveur : d'où le plafond ci-dessous, qui rend l'accident visible au build
 * plutôt que dans une app signée. C'est le même garde-fou que le bundle de la
 * microVM, pour la même raison — ce qui part chez les gens ne se relit pas.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const OUT_DIR = path.join(repo, "desktop", "dist");

/** Une coquille MINCE (§1 de docs/desktop-electron.md) : main + preload, en Ko. */
const MAX_BUNDLE_BYTES = 200_000;

await mkdir(OUT_DIR, { recursive: true });

const result = await build({
  entryPoints: [
    path.join(repo, "desktop", "src", "main.ts"),
    path.join(repo, "desktop", "src", "preload.ts"),
  ],
  outdir: OUT_DIR,
  bundle: true,
  platform: "node",
  format: "cjs",
  // Electron 43 embarque Node 24 — mesuré en MIN-290, et c'est aussi la cible du
  // bundle du harness de l'agent (§7.3).
  target: "node24",
  // `electron` est fourni par le runtime, jamais par nous. `electron-updater`,
  // lui, est une vraie dépendance npm : elle est empaquetée dans l'app par
  // electron-builder (ses `node_modules` de production) et se charge par
  // `require` à l'exécution. La bundler ici la ferait entrer deux fois — et
  // surtout, elle lit `app-update.yml` par le chemin de son propre paquet.
  external: ["electron", "electron-updater"],
  // Pas de minification : quand la coquille casse chez quelqu'un, la pile
  // d'appel est tout ce qu'on aura.
  minify: false,
  sourcemap: false,
  tsconfig: path.join(repo, "desktop", "tsconfig.json"),
  logLevel: "info",
  metafile: true,
});

// Les chemins du metafile sont relatifs au RÉPERTOIRE COURANT, pas au dépôt :
// ce script se lance aussi bien depuis la racine que depuis `desktop/`.
for (const [file, output] of Object.entries(result.metafile.outputs)) {
  const { size } = await stat(path.resolve(process.cwd(), file));
  if (size > MAX_BUNDLE_BYTES) {
    const inputs = Object.entries(output.inputs)
      .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput)
      .slice(0, 5)
      .map(([f, i]) => `  ${(i.bytesInOutput / 1024).toFixed(0)} Ko  ${f}`)
      .join("\n");
    console.error(
      `[build:desktop] ${file} fait ${(size / 1024).toFixed(0)} Ko, au-dessus du plafond de ${(MAX_BUNDLE_BYTES / 1024).toFixed(0)} Ko.\nLes plus gros contributeurs :\n${inputs}`
    );
    process.exit(1);
  }
  console.log(`[build:desktop] ${file} — ${(size / 1024).toFixed(1)} Ko`);
}
