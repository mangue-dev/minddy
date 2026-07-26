/**
 * captures/ — livraison des captures vers la landing.
 *
 * Le maillon entre `captures/shots/<nom>/out/*.png` (ce que Playwright produit)
 * et `components/marketing/screenshot-slots.ts` (ce que la landing affiche).
 *
 * Deux règles tiennent tout le mécanisme :
 *
 *  1. **Le nom du fichier EST le contrat.** `<emplacement>-<langue>-<thème>.webp`
 *     dans `public/captures/`. Rien d'autre à déclarer : le composant déduit
 *     l'URL de l'emplacement, de la locale et du thème du visiteur.
 *
 *  2. **Un manifeste généré décide de ce qui s'affiche.** La landing ne pointe
 *     une image que si elle existe vraiment. Tant qu'une variante n'est pas
 *     publiée, l'emplacement rend son cadre de réservation — jamais une image
 *     cassée. C'est ce qui permet de publier écran par écran sans jamais
 *     dégrader la page.
 *
 * Le composant rend `<Image unoptimized>` : Next ne recompresse rien, donc le
 * poids servi est exactement celui du fichier écrit ici. D'où la conversion en
 * WebP et le redimensionnement — un PNG de capture 2× pèse plusieurs Mo.
 *
 *   node captures/lib/publish.mjs            # régénère le manifeste
 *   node captures/lib/publish.mjs --list     # ce qui est publié aujourd'hui
 *   node captures/lib/publish.mjs --shots    # livre les PNG déjà produits
 *   node captures/lib/publish.mjs --shots numo agent   # … ou seulement ceux-là
 */
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { ROOT } from "./env.mjs";

/** Où vivent les images servies. Sous `public/`, donc servies telles quelles. */
export const PUBLIC_DIR = resolve(ROOT, "public/captures");

/** Le manifeste généré, lu par la landing. Ne jamais l'éditer à la main. */
export const MANIFEST_PATH = resolve(ROOT, "components/marketing/screenshot-manifest.ts");

/** Le catalogue des emplacements, source de vérité des identifiants valides. */
const SLOTS_PATH = resolve(ROOT, "components/marketing/screenshot-slots.ts");

export const LANGS = ["fr", "en"];
export const THEMES = ["light", "dark"];

/**
 * Largeur servie par défaut.
 *
 * Le composant rend `<Image unoptimized>` : Next ne génère AUCUN `srcset`, donc
 * un seul fichier sert tous les écrans. Il doit donc porter la définition du
 * cas le plus exigeant — un écran Retina —, soit 2× la largeur d'affichage.
 *
 * Mesuré sur la landing en 1920 de large, la plupart des emplacements
 * s'affichent autour de 520-540 px (deux colonnes dans un conteneur de
 * 1104 px). 1600 px leur donne donc déjà 3×, largement au-delà du nécessaire :
 * pour eux, ce n'est pas la définition qui manquait, c'était la qualité.
 */
const DEFAULT_WIDTH = 1600;

/**
 * Les deux emplacements PLEINE LARGEUR, qui ne rentrent pas dans le cas
 * général : à 1600 px ils étaient servis en dessous du 2×, et ça se voyait.
 *
 *   heroBoard     1102 px affichés → 1,45× à 1600. C'est la première image de
 *                 la page, et la plus grande.
 *   featureCycle   894 px affichés → 1,79× à 1600.
 *
 * Les valeurs sont 2× la largeur mesurée, arrondies au multiple de 16. Les
 * remesurer si la largeur du conteneur de la landing change (`max-w-6xl`
 * aujourd'hui, moins les 24 px de marge de chaque côté).
 */
const SLOT_WIDTHS = {
  heroBoard: 2208,
  featureCycle: 1792,
};

/**
 * Qualité WebP. 82 rendait le texte d'interface pâteux — des captures d'app,
 * c'est presque uniquement du petit texte et des bords nets, exactement ce que
 * la compression avec pertes dégrade en premier. 92 double à peine le poids
 * (le hero passe de 109 à 220 Ko) et rend les glyphes francs.
 */
const DEFAULT_QUALITY = 92;

/** `effort` maximal : plus lent à l'encodage, plus petit à qualité égale. On
    publie une poignée d'images à la main, la seconde gagnée ne vaut rien. */
const WEBP_EFFORT = 6;

/** Identifiants d'emplacement déclarés dans le catalogue. */
export async function knownSlotIds() {
  const source = await readFile(SLOTS_PATH, "utf8");
  const ids = [...source.matchAll(/^\s{4}id:\s*"([a-zA-Z0-9_]+)"/gm)].map((m) => m[1]);
  if (ids.length === 0) {
    throw new Error("captures: aucun emplacement trouvé dans screenshot-slots.ts.");
  }
  return new Set(ids);
}

export function assetName(slot, lang, theme) {
  return `${slot}-${lang}-${theme}.webp`;
}

/**
 * Convertit une capture et la publie.
 *
 *   await publishShot({ slot: "heroBoard", lang: "fr", theme: "light",
 *                       input: "captures/shots/hero-board/out/fr-light.png" })
 */
export async function publishShot({
  slot,
  lang,
  theme,
  input,
  // Un emplacement pleine largeur porte sa propre cible ; les autres tiennent
  // largement dans la valeur commune. Voir `SLOT_WIDTHS`.
  width = SLOT_WIDTHS[slot] ?? DEFAULT_WIDTH,
  quality = DEFAULT_QUALITY,
}) {
  const slots = await knownSlotIds();
  if (!slots.has(slot)) {
    throw new Error(
      `captures: "${slot}" n'est pas un emplacement de screenshot-slots.ts. ` +
        `Connus : ${[...slots].join(", ")}`,
    );
  }
  if (!LANGS.includes(lang)) throw new Error(`captures: langue "${lang}" inconnue.`);
  if (!THEMES.includes(theme)) throw new Error(`captures: thème "${theme}" inconnu.`);

  const source = resolve(ROOT, input);
  await stat(source).catch(() => {
    throw new Error(`captures: capture introuvable — ${input}`);
  });

  await mkdir(PUBLIC_DIR, { recursive: true });
  const output = resolve(PUBLIC_DIR, assetName(slot, lang, theme));

  const image = sharp(source);
  const meta = await image.metadata();
  // `withoutEnlargement` : une capture déjà plus étroite que la cible n'est
  // jamais agrandie — ça ne ferait que la rendre floue et plus lourde.
  await image
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: WEBP_EFFORT })
    .toFile(output);

  const { size } = await stat(output);
  const { width: servedWidth } = await sharp(output).metadata();

  // La densité réellement servie : un chiffre sous 2 veut dire qu'un écran
  // Retina interpolera l'image, et ça se voit sur du texte d'interface. C'est
  // la seule mesure qui dise si `SLOT_WIDTHS` est encore juste.
  return {
    output,
    name: basename(output),
    sourceWidth: meta.width ?? null,
    servedWidth: servedWidth ?? null,
    bytes: size,
  };
}

/** Ce qui est réellement publié, lu depuis le disque. */
export async function listPublished() {
  const files = await readdir(PUBLIC_DIR).catch(() => []);
  return files
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -".webp".length))
    .sort();
}

/**
 * Régénère le manifeste à partir du contenu réel de `public/captures/`.
 *
 * Le disque fait foi : supprimer une image la retire de la landing au
 * prochain passage ici, sans qu'on ait à tenir une liste à jour à la main.
 */
export async function writeManifest() {
  const slots = await knownSlotIds();
  const published = await listPublished();

  const orphans = published.filter((key) => {
    const slot = key.replace(/-(fr|en)-(light|dark)$/, "");
    return slot === key || !slots.has(slot);
  });

  const lines = [
    "// GÉNÉRÉ — ne pas éditer à la main.",
    "//",
    "// Produit par `node captures/lib/publish.mjs` à partir du contenu réel de",
    "// `public/captures/`. Chaque entrée vaut `<emplacement>-<langue>-<thème>`",
    "// et garantit que le fichier existe : la landing ne pointe donc jamais une",
    "// image absente, elle rend son cadre de réservation à la place.",
    "",
    "export const PUBLISHED_SCREENSHOTS: ReadonlySet<string> = new Set([",
    ...published.map((key) => `  "${key}",`),
    "]);",
    "",
  ];

  await writeFile(MANIFEST_PATH, lines.join("\n"), "utf8");
  return { published, orphans };
}

/**
 * Publie les PNG DÉJÀ produits par les dossiers de `captures/shots/`, sans
 * relancer une seule capture.
 *
 * La recette dit « regarde les images, puis relance avec --publish » — mais ce
 * second passage rejoue les 40 prises pour ne livrer que des fichiers qui sont
 * déjà sur le disque, et qu'on vient justement de regarder. Cette fonction est
 * ce qu'on veut à ce moment-là : livrer ce qui a été validé, à l'identique.
 *
 * L'emplacement visé est lu dans le `const SLOT` de chaque `shot.mjs`, pour
 * qu'il n'existe pas de deuxième table de correspondance à tenir à jour.
 */
export async function publishExistingShots(names) {
  const shotsDir = resolve(ROOT, "captures/shots");
  const dirs = names?.length
    ? names
    : (await readdir(shotsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

  const done = [];
  const skipped = [];
  const claimed = new Map();

  for (const name of dirs.sort()) {
    let source;
    try {
      source = await readFile(resolve(shotsDir, name, "shot.mjs"), "utf8");
    } catch {
      skipped.push(`${name} — pas de shot.mjs`);
      continue;
    }
    // Une capture débranchée garde son dossier — script en état de marche,
    // intention à jour — mais ne doit plus atteindre la landing. Elle le déclare
    // elle-même par `const RETIRED = true`, en tête de son `shot.mjs`.
    if (/^const RETIRED = true/m.test(source)) {
      skipped.push(`${name} — retiré de la landing (RETIRED)`);
      continue;
    }

    const slot = /^const SLOT = "([^"]+)"/m.exec(source)?.[1];
    if (!slot) {
      skipped.push(`${name} — aucun \`const SLOT\` déclaré`);
      continue;
    }
    // Filet de sécurité si deux dossiers actifs visent le même emplacement : le
    // second effacerait le premier en silence. On refuse les deux — l'ordre du
    // disque n'a pas à décider laquelle des deux images part en production.
    if (claimed.has(slot)) {
      skipped.push(
        `${name} — CONFLIT sur ${slot}, déjà livré par « ${claimed.get(slot)} ». ` +
          `Marquer l'un des deux \`const RETIRED = true\`.`,
      );
      continue;
    }

    const variants = [];
    for (const lang of LANGS) {
      for (const theme of THEMES) {
        const input = `captures/shots/${name}/out/${lang}-${theme}.png`;
        try {
          await stat(resolve(ROOT, input));
        } catch {
          continue;
        }
        const { bytes } = await publishShot({ slot, lang, theme, input });
        variants.push(`${lang}-${theme} (${(bytes / 1024).toFixed(0)} Ko)`);
      }
    }

    if (variants.length === 0) {
      skipped.push(`${name} — aucun PNG dans out/`);
      continue;
    }
    claimed.set(slot, name);
    done.push({ name, slot, variants });
  }

  return { done, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // `--shots [nom…]` livre ce qui est déjà dans les `out/`, sans recapturer.
  const flag = process.argv.indexOf("--shots");
  if (flag !== -1) {
    const only = process.argv.slice(flag + 1).filter((a) => !a.startsWith("-"));
    const { done, skipped } = await publishExistingShots(only);
    for (const { name, slot, variants } of done) {
      console.log(`${name} → ${slot} : ${variants.join(", ")}`);
    }
    if (skipped.length > 0) {
      console.log("\nIgnorés :");
      for (const s of skipped) console.log(`  ${s}`);
    }
  }

  const { published, orphans } = await writeManifest();

  if (published.length === 0) {
    console.log("Aucune capture publiée pour l'instant.");
    console.log("Les emplacements de la landing rendent leur cadre de réservation.");
  } else {
    console.log(`${published.length} variante(s) publiée(s) :`);
    for (const key of published) console.log(`  ${key}.webp`);
  }

  if (orphans.length > 0) {
    console.log("\nFichiers ignorés (nom hors convention ou emplacement inconnu) :");
    for (const key of orphans) console.log(`  ${key}.webp`);
  }

  console.log(`\nManifeste écrit : ${MANIFEST_PATH.replace(ROOT + "/", "")}`);
}
