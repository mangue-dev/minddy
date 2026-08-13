/**
 * Le flux de mise à jour de l'app de bureau, lu par le SITE (MIN-292).
 *
 * `latest-mac.yml` est le manifeste qu'electron-builder publie à côté des
 * binaires. Dans l'app, personne ne le lit à la main : electron-updater s'en
 * charge, à partir de l'`app-update.yml` qu'electron-builder a glissé dans le
 * bundle (voir desktop/electron-builder.yml, bloc `publish`).
 *
 * Ce module sert à l'autre lecteur : la page publique de téléchargement. Elle a
 * besoin de pointer vers le `.dmg` LE PLUS RÉCENT sans qu'un numéro de version
 * soit écrit en dur dans une chaîne traduite — sinon chaque publication demande
 * de retoucher `messages/en.json` et `messages/fr.json`, et la page ment le jour
 * où on oublie.
 *
 * Le parseur est écrit à la main et ne prétend pas lire du YAML : il lit CE
 * fichier-là, dont la forme est produite par un générateur et non par un humain.
 * Ajouter un vrai parseur YAML au bundle du site pour six lignes de liste serait
 * un mauvais échange.
 */

/** Les deux architectures Mac qu'on publie. */
export type MacArch = "arm64" | "x64";

export const MAC_ARCHES: readonly MacArch[] = ["arm64", "x64"] as const;

export function isMacArch(value: string | null | undefined): value is MacArch {
  return value === "arm64" || value === "x64";
}

export interface DesktopRelease {
  version: string;
  /** Les fichiers du flux, dans l'ordre du manifeste. */
  files: ReadonlyArray<{ name: string; arch: MacArch; kind: "dmg" | "zip" }>;
}

/**
 * L'URL de base du flux — le dossier qui contient `latest-mac.yml` et les
 * binaires, SANS barre oblique finale.
 *
 * Elle vit dans l'environnement du serveur et non dans le code : c'est une URL
 * de stockage (Vercel Blob), elle change si le store change, et elle n'est
 * connue qu'après l'avoir créé. Absente, la route de téléchargement le dit
 * franchement au lieu de rediriger vers du vide.
 */
export function desktopFeedBaseUrl(): string | null {
  const raw = process.env.MINDDY_DESKTOP_FEED_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * L'architecture d'un fichier se lit dans son NOM, et c'est aussi ce que fait
 * electron-updater : le manifeste ne porte pas le champ. `-arm64` y est posé par
 * electron-builder dès qu'on publie plus d'une architecture ; tout le reste est
 * de l'Intel.
 */
function archOf(name: string): MacArch {
  return name.includes("arm64") ? "arm64" : "x64";
}

/**
 * Lit `latest-mac.yml`. Rend `null` sur tout ce qui n'a pas la forme attendue —
 * un flux injoignable ou tronqué ne doit pas faire tomber une page publique,
 * juste la priver de son bouton.
 */
export function parseLatestMacFeed(yml: string): DesktopRelease | null {
  const version = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  if (!version) return null;

  const files: Array<{ name: string; arch: MacArch; kind: "dmg" | "zip" }> = [];
  // Les entrées de `files:` sont des tirets indentés portant `url:`. On ne lit
  // que cette ligne-là : `sha512` et `size` sont l'affaire d'electron-updater,
  // qui les vérifie, pas la nôtre.
  for (const match of yml.matchAll(/^\s*-?\s*url:\s*(.+)$/gm)) {
    const name = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (!name) continue;
    const kind = name.endsWith(".dmg") ? "dmg" : name.endsWith(".zip") ? "zip" : null;
    if (!kind) continue;
    if (files.some((file) => file.name === name)) continue;
    files.push({ name, arch: archOf(name), kind });
  }

  return files.length > 0 ? { version, files } : null;
}

/**
 * Le nom du fichier à servir pour une architecture — toujours le `.dmg` : c'est
 * le premier téléchargement, celui d'un humain. Le `.zip` du même flux existe
 * pour Squirrel.Mac et n'a rien à faire dans un navigateur.
 */
export function dmgForArch(release: DesktopRelease, arch: MacArch): string | null {
  return release.files.find((file) => file.kind === "dmg" && file.arch === arch)?.name ?? null;
}
