import { execFile } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * L'ICÔNE DU BUNDLE macOS (MIN-292).
 *
 * `desktop/build/icon.icns` est ce que le Finder, le dock et le sélecteur d'apps
 * affichent. Il n'existe aucun moyen de le poser à l'exécution : c'est le bundle
 * qui parle, et tant qu'on lançait depuis le dépôt, macOS lisait l'`Info.plist`
 * d'`Electron.app` — d'où l'icône Electron au dock jusqu'ici.
 *
 * **La sortie est COMMITÉE, pas gitignorée.** `iconutil` est un binaire macOS :
 * un build sur autre chose ne saurait pas la refabriquer, et un artefact que la
 * chaîne ne peut pas reproduire partout se range à côté de sa source. Ce script
 * n'est donc pas dans le chemin de `npm run dist` — il sert à REFAIRE l'icône
 * quand le logo change :
 *
 *     node scripts/build-desktop-icon.mjs
 *
 * Les dix variantes ne sont pas décoratives : macOS choisit celle qui correspond
 * exactement à la taille demandée, et se rabat sur un redimensionnement flou
 * quand elle manque. `icon_16x16@2x` et `icon_32x32` font tous deux 32 px et
 * doivent tous deux être là.
 */

const exec = promisify(execFile);

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");
const SOURCE = path.join(repo, "public", "web-app-manifest-512x512.png");
const OUT = path.join(repo, "desktop", "build", "icon.icns");
const ICONSET = path.join(repo, "desktop", "build", "icon.iconset");

/** Les dix entrées que `iconutil` attend, avec leur taille RÉELLE en pixels. */
const VARIANTS = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

if (process.platform !== "darwin") {
  console.error("[icon] `iconutil` n'existe que sur macOS — rien à faire ici.");
  process.exit(1);
}

await rm(ICONSET, { recursive: true, force: true });
await mkdir(ICONSET, { recursive: true });

// La source fait 512 px : les deux plus grandes variantes sont donc AGRANDIES.
// C'est assumé — un logo est un aplat de formes simples, il supporte l'échelle —
// mais c'est aussi la raison pour laquelle une source vectorielle serait
// meilleure le jour où le logo se complique.
for (const [name, size] of VARIANTS) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(ICONSET, name));
}

await exec("iconutil", ["-c", "icns", ICONSET, "-o", OUT]);
await rm(ICONSET, { recursive: true, force: true });

const { size } = await stat(OUT);
console.log(`[icon] ${path.relative(repo, OUT)} — ${(size / 1024).toFixed(0)} Ko`);
