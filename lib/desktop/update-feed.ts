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
  files: ReadonlyArray<{
    name: string;
    arch: MacArch;
    kind: "dmg" | "zip";
    /** Octets, `null` quand le manifeste ne le dit pas. */
    size: number | null;
  }>;
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

  /**
   * Lecture LIGNE À LIGNE, et pas une expression régulière multi-lignes.
   * Essayé, et abandonné : une entrée de `files:` s'étend jusqu'à la suivante,
   * ce qui demande de reconnaître la fin de la liste — or JavaScript n'a pas
   * `\Z`, et `\Z` écrit quand même y matche la lettre « Z ». Un curseur qui
   * avance ligne par ligne dit la même chose sans piège.
   */
  const files: Array<DesktopRelease["files"][number]> = [];
  let current: DesktopRelease["files"][number] | null = null;

  const flush = () => {
    if (current && !files.some((file) => file.name === current!.name)) files.push(current);
    current = null;
  };

  for (const line of yml.split("\n")) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line);
    if (url) {
      flush();
      const name = url[1].trim().replace(/^['"]|['"]$/g, "");
      const kind = name.endsWith(".dmg") ? "dmg" : name.endsWith(".zip") ? "zip" : null;
      // `.blockmap` et compagnie : on les saute sans ouvrir d'entrée, sinon les
      // `size:` qui suivent iraient au fichier précédent.
      current = kind ? { name, arch: archOf(name), kind, size: null } : null;
      continue;
    }
    if (!current) continue;
    // Une clé non indentée (`path:`, `releaseDate:`) ferme la liste.
    if (/^\S/.test(line)) {
      flush();
      continue;
    }
    const size = /^\s*size:\s*(\d+)\s*$/.exec(line);
    // La taille est ce que la page de téléchargement affiche : un poids écrit en
    // dur dans une chaîne traduite vieillirait à la première publication.
    if (size) current.size = Number(size[1]);
  }
  flush();

  return files.length > 0 ? { version, files } : null;
}

/**
 * Le nom du fichier à servir pour une architecture — toujours le `.dmg` : c'est
 * le premier téléchargement, celui d'un humain. Le `.zip` du même flux existe
 * pour Squirrel.Mac et n'a rien à faire dans un navigateur.
 */
export function dmgForArch(release: DesktopRelease, arch: MacArch): string | null {
  return dmgEntry(release, arch)?.name ?? null;
}

/** Le `.dmg` d'une architecture, avec sa taille — ce que la page affiche. */
export function dmgEntry(
  release: DesktopRelease,
  arch: MacArch
): DesktopRelease["files"][number] | null {
  return release.files.find((file) => file.kind === "dmg" && file.arch === arch) ?? null;
}

/**
 * « 119 Mo ». En méga-octets DÉCIMAUX, comme le Finder les compte depuis Snow
 * Leopard : afficher 113,8 (des mébioctets) à côté d'un fichier que macOS
 * annonce à 119,4 ferait douter du bon fichier.
 */
export function formatBytes(bytes: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    Math.round(bytes / 1_000_000)
  )} ${locale.startsWith("fr") ? "Mo" : "MB"}`;
}
