import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * L'EMPREINTE DE LA COQUILLE (MIN-292) — « faut-il republier l'app native ? »
 *
 * L'app de bureau est une fenêtre sur `www.minddy.app` : déployer le site suffit
 * à changer ce qu'elle affiche, et **la plupart des déploiements ne la
 * concernent pas du tout**. Republier un binaire, c'est vingt minutes de
 * notarisation et 120 Mo que chaque utilisateur téléchargera. Il faut donc
 * savoir répondre à la question sans se fier au flair.
 *
 * **Ce qui compte n'est pas « ai-je touché à `desktop/` ».** esbuild bundle aussi
 * ce que ces fichiers importent, et la liste surprend — `lib/public-routes.ts` en
 * fait partie, parce que la garde de navigation en dérive. On demande donc à
 * esbuild lui-même quels fichiers entrent dans le bundle, plutôt que de tenir une
 * liste à la main qui se désynchroniserait au premier import ajouté.
 *
 * **Et ce qui compte encore moins, c'est la VERSION.** Le numéro est réécrit à
 * chaque build depuis celui du dépôt : le prendre en compte ferait republier
 * l'app à chaque déploiement du site, c'est-à-dire exactement ce qu'on cherche à
 * éviter. Même raison pour deux autres contenus qui entrent dans le bundle sans
 * rien changer à son comportement — voir `NORMALIZE`.
 *
 *     node scripts/desktop-fingerprint.mjs            # l'empreinte
 *     node scripts/desktop-fingerprint.mjs --explain  # ce qui a changé depuis la publication
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

/**
 * Ce qui entre dans le binaire SANS passer par esbuild : l'empaquetage lui-même.
 * Changer l'icône, les entitlements ou une cible de build produit une app
 * différente, sans qu'une seule ligne de TypeScript ait bougé.
 */
const PACKAGING_INPUTS = [
  "desktop/electron-builder.yml",
  "desktop/build/entitlements.mac.plist",
  // La source Icon Composer est un DOSSIER (`icon.json` + le SVG) : elle est
  // dépliée fichier par fichier, cf. `expandDirectories`.
  "desktop/build/icon.icon",
  // Les options du bundler font partie de ce qui est produit.
  "scripts/build-desktop.mjs",
  // Pour les VERSIONS d'electron et d'electron-updater — voir NORMALIZE, qui en
  // retire le numéro de version de l'app.
  "desktop/package.json",
];

/**
 * Ce qui entre dans le bundle mais ne dit RIEN de son comportement. Chaque
 * entrée est une décision, et chacune a coûté une réflexion :
 *
 * - `desktop/package.json` — le numéro de version, réécrit à chaque build depuis
 *   celui du dépôt. Sans cette coupe, tout déploiement du site republierait
 *   l'app. Le reste du fichier (les dépendances, donc la version d'Electron)
 *   compte, lui.
 * - `lib/changelog.ts` — n'entre dans le bundle que par ricochet
 *   (`CHANGELOG_LAST_MODIFIED`, lu par `public-routes.ts`), et n'apporte qu'une
 *   DATE. Sans cette coupe, publier une nouveauté ferait télécharger 120 Mo à
 *   tout le monde pour rien.
 * - `lib/public-routes.ts` — ses `lastModified` sont tenus à la main pour le
 *   sitemap (voir CLAUDE.md) et bougent à chaque page retouchée. La coquille,
 *   elle, ne lit que les CHEMINS. Le reste du fichier compte : **ajouter une
 *   page publique DOIT republier l'app**, sans quoi les installations
 *   existantes l'afficheraient dans la fenêtre au lieu de l'ouvrir dans le
 *   navigateur.
 */
const NORMALIZE = {
  "desktop/package.json": (src) => src.replace(/"version":\s*"[^"]*"/, '"version":"·"'),
  "lib/changelog.ts": () => "",
  "lib/public-routes.ts": (src) => src.replace(/^\s*lastModified:.*$/gm, ""),
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** Les fichiers qu'esbuild fait réellement entrer dans le bundle. */
async function bundleInputs() {
  const result = await build({
    entryPoints: [
      path.join(repo, "desktop", "src", "main.ts"),
      path.join(repo, "desktop", "src", "preload.ts"),
    ],
    outdir: path.join(repo, "desktop", "dist"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron", "electron-updater"],
    tsconfig: path.join(repo, "desktop", "tsconfig.json"),
    // On ne veut que la liste : rien n'est écrit sur le disque.
    write: false,
    metafile: true,
    logLevel: "silent",
  });

  const inputs = new Set();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const input of Object.keys(output.inputs)) inputs.add(input);
  }
  return [...inputs];
}

/**
 * Déplie les entrées qui sont des dossiers en leurs fichiers, chemins relatifs au
 * dépôt. Une entrée de `PACKAGING_INPUTS` peut en être un depuis que l'icône est
 * une source Icon Composer : garder le détail fichier par fichier, c'est ce qui
 * permet à `--explain` de dire *quoi* a changé dans l'icône.
 */
async function expandDirectories(entries) {
  const files = [];
  for (const entry of entries) {
    if ((await stat(path.join(repo, entry))).isDirectory()) {
      for (const name of await readdir(path.join(repo, entry), { recursive: true })) {
        const child = path.join(entry, name);
        if ((await stat(path.join(repo, child))).isFile()) files.push(child);
      }
    } else {
      files.push(entry);
    }
  }
  return files;
}

/**
 * L'empreinte, et le détail par fichier — c'est ce détail qui permet de DIRE ce
 * qui a changé plutôt que d'annoncer « quelque chose a changé ».
 */
export async function computeDesktopFingerprint() {
  const files = [...(await bundleInputs()), ...(await expandDirectories(PACKAGING_INPUTS))].sort();
  const perFile = {};

  for (const file of files) {
    const raw = await readFile(path.join(repo, file));
    const normalize = NORMALIZE[file];
    const content = normalize ? normalize(raw.toString("utf8")) : raw;
    // Un fichier neutralisé entièrement n'entre pas dans l'empreinte : le voir
    // dans la liste avec un hash constant ferait croire qu'il compte.
    if (normalize && content === "") continue;
    perFile[file] = sha256(content);
  }

  const fingerprint = sha256(
    Object.entries(perFile)
      .map(([file, hash]) => `${file}:${hash}`)
      .join("\n")
  );
  return { fingerprint, files: perFile };
}

/** Ce qui a changé entre deux relevés — ajouts, retraits, modifications. */
export function diffFingerprints(published = {}, current = {}) {
  const names = [...new Set([...Object.keys(published), ...Object.keys(current)])].sort();
  return names
    .filter((name) => published[name] !== current[name])
    .map((name) => ({
      file: name,
      change: !published[name] ? "ajouté" : !current[name] ? "retiré" : "modifié",
    }));
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { fingerprint, files } = await computeDesktopFingerprint();

  if (!process.argv.includes("--explain")) {
    console.log(fingerprint);
  } else {
    const released = await readFile(path.join(repo, "desktop", "released.json"), "utf8")
      .then(JSON.parse)
      .catch(() => null);

    if (!released) {
      console.log("Aucune publication enregistrée (desktop/released.json absent).");
      console.log(`Empreinte actuelle : ${fingerprint}`);
    } else if (released.fingerprint === fingerprint) {
      console.log(`À jour — publiée en ${released.version}, empreinte ${fingerprint.slice(0, 12)}.`);
    } else {
      console.log(`Publiée : ${released.version} (${released.fingerprint.slice(0, 12)})`);
      console.log(`Actuelle : ${fingerprint.slice(0, 12)}`);
      console.log("");
      for (const { file, change } of diffFingerprints(released.files, files)) {
        console.log(`  ${change.padEnd(9)} ${file}`);
      }
    }
  }
}
