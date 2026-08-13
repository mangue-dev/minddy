import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

/**
 * PUBLIER LE FLUX DE L'APP DE BUREAU (MIN-292).
 *
 * electron-builder a produit `desktop/release/` ; ce script en pousse le contenu
 * utile dans Vercel Blob, sous le préfixe `desktop/`. C'est tout le « stockage
 * quelconque » du §5 du cadrage : le flux de mise à jour n'a besoin de rien
 * d'autre qu'un dossier servi en HTTPS avec des noms stables.
 *
 *     MINDDY_DESKTOP_FEED_URL=https://…/desktop \
 *     BLOB_READ_WRITE_TOKEN=… \
 *     node scripts/publish-desktop.mjs
 *
 * **`addRandomSuffix: false` n'est pas une préférence** : les noms de fichiers
 * SONT le contrat du flux. `latest-mac.yml` les cite, electron-updater les
 * résout relativement à l'URL de base, et un suffixe aléatoire casserait le lien
 * entre le manifeste et les binaires qu'il annonce.
 *
 * **Deux refus, avant le premier octet envoyé.** Ils sont là parce que les deux
 * pannes correspondantes sont muettes : une app publiée sans signature
 * s'installe et ne se mettra JAMAIS à jour (Squirrel.Mac exige une app signée),
 * et un `app-update.yml` sans URL donne une app qui ne cherche nulle part. Dans
 * les deux cas rien ne casse à la publication, et tout est cassé chez les gens.
 */

const exec = promisify(execFile);

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const RELEASE_DIR = path.join(repo, "desktop", "release");
const PREFIX = "desktop";

/** Ce qui part : les binaires, leurs blockmaps (deltas) et le manifeste. */
const PUBLISHED = /\.(dmg|zip|blockmap)$|^latest-mac\.yml$/;

function fail(message) {
  console.error(`[publish-desktop] ${message}`);
  process.exit(1);
}

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!token) fail("BLOB_READ_WRITE_TOKEN manque — rien à publier sans store.");

const feedUrl = process.env.MINDDY_DESKTOP_FEED_URL?.trim();
if (!feedUrl) {
  fail(
    "MINDDY_DESKTOP_FEED_URL manque. C'est la même URL que celle du bloc `publish` " +
      "de desktop/electron-builder.yml : sans elle, l'app empaquetée ne cherche nulle part."
  );
}

let entries;
try {
  entries = await readdir(RELEASE_DIR);
} catch {
  fail(`${path.relative(repo, RELEASE_DIR)} n'existe pas — lancer d'abord \`npm --prefix desktop run dist\`.`);
}

if (!entries.includes("latest-mac.yml")) {
  fail("latest-mac.yml manque : sans manifeste, il n'y a pas de flux, seulement des fichiers.");
}

// Refus 1 — l'app doit être signée. `codesign -dv` échoue (code ≠ 0) sur un
// bundle non signé, et c'est exactement le cas qu'on veut attraper.
const apps = [];
for (const arch of ["mac-arm64", "mac"]) {
  const app = path.join(RELEASE_DIR, arch, "minddy.app");
  try {
    await stat(app);
    apps.push(app);
  } catch {
    // Cette architecture n'a pas été construite : `latest-mac.yml` ne
    // l'annoncera pas non plus, rien à vérifier.
  }
}
if (apps.length === 0) fail("aucun `minddy.app` dans desktop/release — le build n'a pas abouti.");

for (const app of apps) {
  try {
    await exec("codesign", ["-dv", "--verbose=2", app]);
  } catch {
    fail(
      `${path.relative(repo, app)} n'est PAS signé. Squirrel.Mac exige une app signée : ` +
        "la publier donnerait une app qui s'installe et ne se met jamais à jour. " +
        "Voir docs/desktop-signing.md."
    );
  }
}

// Refus 2 — l'`app-update.yml` du bundle porte bien l'URL du flux. C'est le
// fichier que lit electron-updater, et il est écrit au moment de l'empaquetage :
// un `MINDDY_DESKTOP_FEED_URL` absent CE jour-là ne se voit nulle part ailleurs.
for (const app of apps) {
  const inside = path.join(app, "Contents", "Resources", "app-update.yml");
  const content = await readFile(inside, "utf8").catch(() => "");
  if (!/^url:\s*\S+/m.test(content)) {
    fail(
      `${path.relative(repo, inside)} n'a pas d'URL de flux : l'app empaquetée ne chercherait ` +
        "aucune mise à jour. Reconstruire avec MINDDY_DESKTOP_FEED_URL défini."
    );
  }
}

const files = entries.filter((name) => PUBLISHED.test(name)).sort();
if (files.length === 0) fail("rien à publier dans desktop/release.");

// Le manifeste EN DERNIER, toujours. Il est ce qui annonce une version ; le
// publier avant ses binaires ouvre une fenêtre, courte mais réelle, pendant
// laquelle chaque app installée télécharge un 404.
files.sort((a, b) => Number(a === "latest-mac.yml") - Number(b === "latest-mac.yml"));

for (const name of files) {
  const body = await readFile(path.join(RELEASE_DIR, name));
  const { url } = await put(`${PREFIX}/${name}`, body, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    // Le manifeste est relu à chaque vérification : le mettre en cache long
    // ferait vivre une version périmée bien après sa remplaçante. Les binaires,
    // eux, sont immuables — leur nom porte leur version.
    cacheControlMaxAge: name === "latest-mac.yml" ? 60 : 31_536_000,
  });
  console.log(`[publish-desktop] ${name} → ${url}`);
}

console.log(
  `[publish-desktop] ${files.length} fichiers publiés. Vérifier que ${feedUrl}/latest-mac.yml répond.`
);
