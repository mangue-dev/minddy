/**
 * Ce qu'un fichier SANS patch est vraiment (MIN-66).
 *
 * GitHub comme GitLab omettent le patch dans deux cas très différents : le
 * fichier est binaire (il n'y a pas de diff textuel à faire), ou il est trop
 * volumineux (il y en aurait un, la forge refuse de l'envoyer). La vue diff les
 * disait d'un seul message — « binaire ou trop volumineux » —, ce qui ne
 * renseigne sur ni l'un ni l'autre.
 *
 * On tranche à l'extension, seul indice qu'on ait : la liste des fichiers ne
 * porte ni type MIME ni drapeau binaire.
 */

/** Extensions rendues côte à côte, avec leur type MIME servi par le proxy. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  // SVG est du texte : la forge en envoie donc le patch, et on ne passe ici que
  // s'il est trop gros pour ça. Servi en `image/svg+xml`, il est rendu par le
  // navigateur DANS une balise <img> — donc sans script ni requête externe
  // possible, contrairement à une insertion en ligne dans le document.
  svg: "image/svg+xml",
};

/**
 * Extensions binaires connues qu'on ne sait pas MONTRER — l'affichage s'arrête
 * au constat, mais il le dit juste. Hors de cette liste et hors des images, un
 * fichier sans patch est réputé « trop volumineux » : c'est le cas le plus
 * fréquent (lockfiles, gros JSON, données), et le seul où « voir sur GitHub »
 * apprend vraiment quelque chose.
 */
const BINARY_EXTENSIONS = new Set([
  "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "wav", "ogg", "flac", "m4a",
  "mp4", "webm", "mov", "avi", "mkv",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar", "wasm",
  "psd", "ai", "sketch", "fig", "xcf",
  "db", "sqlite", "sqlite3", "pyc", "node",
]);

export type NoPatchKind = "image" | "binary" | "unchanged" | "tooLarge";

function extensionOf(filename: string): string {
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  return base.includes(".") ? (base.split(".").pop() ?? "") : "";
}

/**
 * Ce qu'on affiche à la place du diff, pour un fichier que la forge n'a pas
 * patché.
 *
 * L'ordre compte. L'extension d'abord : un binaire est annoncé 0 ajout / 0
 * retrait par les deux forges, il tomberait sinon dans le cas « sans changement
 * de contenu » ci-dessous. Ensuite seulement le compte de lignes — 0/0 sur un
 * fichier texte veut dire qu'il n'y a RIEN à differ (renommage pur, changement
 * de mode), pas que la forge a renoncé faute de place. C'est le cas d'un
 * renommage à 100 % de similarité, qui s'annonçait « trop volumineux ».
 */
export function noPatchKind(file: {
  filename: string;
  additions: number;
  deletions: number;
}): NoPatchKind {
  const ext = extensionOf(file.filename);
  if (ext in IMAGE_TYPES) return "image";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return file.additions === 0 && file.deletions === 0 ? "unchanged" : "tooLarge";
}

/**
 * Type MIME servi par le proxy d'octets. Déduit de l'extension, JAMAIS repris de
 * la forge : le contenu vient d'un dépôt tiers, et le renvoyer sous le type
 * qu'il s'attribue reviendrait à laisser un dépôt choisir ce que le navigateur
 * exécute sur notre origine. Une extension hors liste n'est pas servie du tout.
 */
export function imageMimeType(filename: string): string | null {
  return IMAGE_TYPES[extensionOf(filename)] ?? null;
}
