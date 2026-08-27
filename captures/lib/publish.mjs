/**
 * catches/ — delivery of catches to the landing.
 *
 * The link between `captures/shots/<nom>/out/*.png` (what Playwright produces)
 * and `components/marketing/screenshot-slots.ts` (what the landing displays).
 *
 * Two rules govern the whole mechanism:
 *
 * 1. **The file name IS the contract.** `<slot>-<language>-<theme>.webp`
 * in `public/captures/`. Nothing else to declare: the component deducted
 * the URL of the visitor's location, locale, and theme.
 *
 * 2. **A generated manifest decides what is displayed.** The landing does not point
 * an image only if it really exists. As long as a variant is not
 * published, the location renders its reservation frame — never an image
 * broken. This is what allows you to publish screen by screen without ever
 * degrade the page.
 *
 * The component renders `<Image unoptimized>`: Next does not recompress anything, so the
 * weight served is exactly that of the file written here. Hence the conversion to
 * WebP and resizing — a 2x capture PNG weighs several MB.
 *
 * node captures/lib/publish.mjs # regenerates the manifest
 * node captures/lib/publish.mjs --list # what is published today
 * node captures/lib/publish.mjs --shots # deliver PNGs already produced
 * node captures/lib/publish.mjs --shots numo agent # … or only these
 */
import { mkdir, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import { ROOT } from "./env.mjs";

/** Where the served images live. Under `public/`, therefore served as is. */
export const PUBLIC_DIR = resolve(ROOT, "public/captures");

/** The generated manifest, read by the landing. Never edit it by hand. */
export const MANIFEST_PATH = resolve(ROOT, "components/marketing/screenshot-manifest.ts");

/** The location catalog, source of truth for valid identifiers. */
const SLOTS_PATH = resolve(ROOT, "components/marketing/screenshot-slots.ts");

export const LANGS = ["fr", "en", "de", "pt-BR", "it", "es"];
export const THEMES = ["light", "dark"];

/**
 * Width served by default.
 *
 * The component renders `<Image unoptimized>`: Next generates NO `srcset`, so
 * a single file serves all screens. It must therefore carry the definition of
 * the most demanding case — a Retina screen —, i.e. 2× the display width.
 *
 * Measured on landing in 1920 wide, most locations
 * appear around 520-540 px (two columns in a container
 * 1104 px). 1600 px therefore already gives them 3×, well beyond what is necessary:
 * for them, it wasn't the definition that was lacking, it was the quality.
 */
const DEFAULT_WIDTH = 1600;

/**
 * Both FULL WIDTH slots, which do not fit in the case
 * general: at 1600 px they were served below 2×, and it showed.
 *
 * heroBoard 1102 px displayed → 1.45× at 1600. This is the first image of
 * the page, and the largest.
 * featureCycle 894 px displayed → 1.79× at 1600.
 *
 * Values ​​are 2× the measured width, rounded to the multiple of 16.
 * remeasure if the width of the landing container changes (`max-w-6xl`
 * today, minus the 24 px of margin on each side).
 */
const SLOT_WIDTHS = {
  heroBoard: 2208,
  featureCycle: 1792,
};

/**
 * WebP quality. 82 made interface text mushy — app screenshots,
 * it's almost all small text and sharp edges, exactly what
 * lossy compression degrades first. 92 barely doubles the weight
 * (the hero goes from 109 to 220 KB) and makes the glyphs clear.
 */
const DEFAULT_QUALITY = 92;

/** `effort` maximum: slower at encoding, smaller at equal quality. We
    posts a handful of images by hand, the second gained is worthless. */
const WEBP_EFFORT = 6;

/** Location identifiers declared in the catalog. */
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
 * Converts a capture and publishes it.
 *
 *   await publishShot({ slot: "heroBoard", lang: "fr", theme: "light",
 *                       input: "captures/shots/hero-board/out/fr-light.png" })
 */
export async function publishShot({
  slot,
  lang,
  theme,
  input,
  // A full-width slot carries its own target; the others hold
  // largely in common value. See `SLOT_WIDTHS`.
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
  // `withoutEnlargement`: a capture already narrower than the target is
  // never enlarged — that would only make it blurry and heavier.
  await image
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: WEBP_EFFORT })
    .toFile(output);

  const { size } = await stat(output);
  const { width: servedWidth } = await sharp(output).metadata();

  // The density actually served: a number below 2 means that a screen
  // Retina will interpolate the image, and this is visible on interface text. It is
  // the only measurement that says if `SLOT_WIDTHS` is still correct.
  return {
    output,
    name: basename(output),
    sourceWidth: meta.width ?? null,
    servedWidth: servedWidth ?? null,
    bytes: size,
  };
}

/** What is actually published, read from disk. */
export async function listPublished() {
  const files = await readdir(PUBLIC_DIR).catch(() => []);
  return files
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.slice(0, -".webp".length))
    .sort();
}

/**
 * Regenerates the manifest from the actual contents of `public/captures/`.
 *
 * The disk is authoritative: deleting an image removes it from the landing
 * next passage here, without having to keep an up-to-date list by hand.
 */
export async function writeManifest() {
  const slots = await knownSlotIds();
  const published = await listPublished();

  const orphans = published.filter((key) => {
    const slot = key.replace(/-(fr|en|de|pt-BR|it|es)-(light|dark)$/, "");
    return slot === key || !slots.has(slot);
  });

  const lines = [
    "// GENERATED — do not edit manually.",
    "//",
    "// Produced by `node captures/lib/publish.mjs` from the actual contents of",
    "// `public/captures/`. Each entry is `<slot>-<locale>-<theme>` and confirms",
    "// that the file exists, so the landing page never references a missing image",
    "// and renders its placeholder frame instead.",
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
 * Publishes the PNGs ALREADY produced by the `captures/shots/` files, without
 * retry a single capture.
 *
 * The recipe says "look at the images, then relaunch with --publish" — but this
 * second pass replays the 40 takes to deliver only files that are
 * already on the disc, and which we have just watched. This function is
 * what we want at that moment: deliver what has been validated, identically.
 *
 * The targeted location is read in the `const SLOT` of each `shot.mjs`, to
 * that there is no second correspondence table to keep up to date.
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
    // An unplugged capture keeps its file — script in working order,
    // intention updated — but must no longer reach the landing. She declares it
    // itself by `const RETIRED = true`, at the top of its `shot.mjs`.
    if (/^const RETIRED = true/m.test(source)) {
      skipped.push(`${name} — retiré de la landing (RETIRED)`);
      continue;
    }

    const slot = /^const SLOT = "([^"]+)"/m.exec(source)?.[1];
    if (!slot) {
      skipped.push(`${name} — aucun \`const SLOT\` déclaré`);
      continue;
    }
    // Safety net if two active folders target the same slot: the second would
    // silently overwrite the first. Reject both — disk order must not decide
    // which image reaches production.
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
  // `--shots [name…]` publishes what is already in `out/`, without recapturing.
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
